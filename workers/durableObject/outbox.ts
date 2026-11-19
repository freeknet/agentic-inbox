/**
 * Outbox logic for MailboxDO: queueing, the alarm-driven sender, retry and
 * quota handling, and webhook-driven delivery state.
 *
 * All timestamps are epoch milliseconds. Quota accounting counts recipients
 * (To + Cc + Bcc) per UTC calendar day, matching Resend (plan §A3, fixes B1).
 */
import {
	type EmailProvider,
	type OutgoingMessage,
	type SendResult,
	utcDay,
} from "../lib/email-provider";

export const DAILY_RECIPIENT_LIMIT = 100;
export const MAX_RECIPIENTS_PER_MESSAGE = 50;
/** Undo window for interactive sends. */
export const UNDO_DELAY_MS = 10_000;
export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const WEBHOOK_DEDUPE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export interface OutboxAttachmentRef {
	/** R2 key of the stored bytes. */
	key: string;
	filename: string;
	contentType: string;
	contentId?: string;
}

/** What the alarm needs to build the provider request. Stored as JSON. */
export interface OutboxPayload {
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	subject: string;
	html?: string;
	text?: string;
	headers?: Record<string, string>;
	attachments?: OutboxAttachmentRef[];
}

export type OutboxStatus = "queued" | "sending" | "sent" | "failed";

export interface OutboxRow {
	id: string;
	status: OutboxStatus;
	payload: string;
	recipient_count: number;
	send_at: number;
	next_attempt_at: number;
	attempts: number;
	last_error: string | null;
	provider_id: string | null;
	quota_day: string;
	created_at: number;
	sent_at: number | null;
}

export function backoffMs(attempts: number): number {
	return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_MS);
}

export function countRecipients(p: Pick<OutboxPayload, "to" | "cc" | "bcc">): number {
	return p.to.length + (p.cc?.length ?? 0) + (p.bcc?.length ?? 0);
}

// Delivery states only move forward, so out-of-order webhooks (e.g. `email.sent`
// arriving after `email.delivered`) don't regress the badge.
const DELIVERY_RANK: Record<string, number> = {
	queued: 0,
	sent: 1,
	delayed: 2,
	delivered: 3,
	bounced: 4,
	complained: 4,
	failed: 4,
	suppressed: 4,
};

const EVENT_TO_STATUS: Record<string, string> = {
	"email.sent": "sent",
	"email.delivered": "delivered",
	"email.delivery_delayed": "delayed",
	"email.bounced": "bounced",
	"email.complained": "complained",
	"email.failed": "failed",
	"email.suppressed": "suppressed",
};

export interface WebhookEvent {
	type: string;
	created_at?: string;
	data?: {
		email_id?: string;
		message_id?: string;
		from?: string;
		email?: string;
		origin?: string;
		created_at?: string;
		tags?: Record<string, string> | Array<{ name: string; value: string }>;
		[k: string]: unknown;
	};
}

function tagValue(tags: unknown, name: string): string | undefined {
	if (!tags || typeof tags !== "object") return undefined;
	if (Array.isArray(tags)) {
		const v = tags.find((t) => t && t.name === name)?.value;
		return typeof v === "string" ? v : undefined;
	}
	const v = (tags as Record<string, unknown>)[name];
	return typeof v === "string" ? v : undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(bin);
}

function stripAngles(id: string): string {
	return id.trim().replace(/^<|>$/g, "");
}

export class Outbox {
	constructor(
		private readonly sql: SqlStorage,
		private readonly bucket: R2Bucket,
		private readonly getProvider: () => EmailProvider | null,
	) {}

	// ── Meta ───────────────────────────────────────────────────────

	private getMeta(key: string): string | null {
		const row = [...this.sql.exec(`SELECT value FROM outbox_meta WHERE key = ?`, key)][0] as
			| { value: string }
			| undefined;
		return row?.value ?? null;
	}

	private setMeta(key: string, value: string) {
		this.sql.exec(
			`INSERT INTO outbox_meta (key, value) VALUES (?1, ?2)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			key,
			value,
		);
	}

	pausedUntil(): number {
		return Number(this.getMeta("paused_until") ?? 0);
	}

	// ── Quota ──────────────────────────────────────────────────────

	/** Recipients counted against the given UTC day (queued, in flight, or sent). */
	recipientsUsed(day: string): number {
		const row = [...this.sql.exec(
			`SELECT COALESCE(SUM(recipient_count), 0) AS n FROM outbox
			 WHERE quota_day = ?1 AND status IN ('queued', 'sending', 'sent')`,
			day,
		)][0] as { n: number };
		const local = row.n;
		// Resend's own count (x-resend-daily-quota) may be higher, e.g. after a reset of local state.
		const remote = this.getMeta("quota_day") === day ? Number(this.getMeta("quota_used") ?? 0) : 0;
		return Math.max(local, remote);
	}

	/** Returns an error message, or null if `count` more recipients fit today. */
	checkQuota(count: number, nowMs: number): string | null {
		if (count < 1) return "At least one recipient is required";
		if (count > MAX_RECIPIENTS_PER_MESSAGE) {
			return `Too many recipients: ${count} (max ${MAX_RECIPIENTS_PER_MESSAGE} across To, Cc and Bcc)`;
		}
		const used = this.recipientsUsed(utcDay(nowMs));
		if (used + count > DAILY_RECIPIENT_LIMIT) {
			return `Daily send limit reached: ${used} of ${DAILY_RECIPIENT_LIMIT} recipients used today (UTC); this message has ${count}`;
		}
		return null;
	}

	// ── Queue ──────────────────────────────────────────────────────

	/** Insert the outbox row. Call inside the caller's transaction. */
	insert(id: string, payload: OutboxPayload, sendAt: number, nowMs: number) {
		this.sql.exec(
			`INSERT INTO outbox (id, status, payload, recipient_count, send_at, next_attempt_at, attempts, quota_day, created_at)
			 VALUES (?1, 'queued', ?2, ?3, ?4, ?4, 0, ?5, ?6)`,
			id,
			JSON.stringify(payload),
			countRecipients(payload),
			sendAt,
			utcDay(Math.max(sendAt, nowMs)),
			nowMs,
		);
	}

	get(id: string): OutboxRow | null {
		return ([...this.sql.exec(`SELECT * FROM outbox WHERE id = ?`, id)][0] as unknown as OutboxRow) ?? null;
	}

	/** Remove a queued row if its undo window is still open. Call inside a transaction. */
	cancel(id: string, nowMs: number): "cancelled" | "not_found" | "too_late" {
		const row = this.get(id);
		if (!row) return "not_found";
		if (row.status !== "queued" || row.send_at <= nowMs || row.attempts > 0) return "too_late";
		this.sql.exec(`DELETE FROM outbox WHERE id = ?`, id);
		return "cancelled";
	}

	/** Epoch ms of the next time the alarm must run, or null if nothing is pending. */
	nextWakeAt(): number | null {
		const row = [...this.sql.exec(
			`SELECT MIN(next_attempt_at) AS t FROM outbox WHERE status = 'queued'`,
		)][0] as { t: number | null };
		if (row.t === null) return null;
		return Math.max(row.t, this.pausedUntil());
	}

	// ── Alarm-driven sending ──────────────────────────────────────

	/**
	 * Send every due row. `setDeliveryStatus` mirrors the outbox state onto the
	 * Sent email row. Returns the ids attempted, for logging and tests.
	 */
	async processDue(nowMs: number, setDeliveryStatus: (id: string, status: string) => void): Promise<string[]> {
		// Only the alarm sends, so a row still marked 'sending' was interrupted
		// (eviction, crash). Requeue it; the Idempotency-Key prevents a duplicate.
		this.sql.exec(`UPDATE outbox SET status = 'queued' WHERE status = 'sending'`);

		const attempted: string[] = [];
		if (this.pausedUntil() > nowMs) return attempted;

		const due = [...this.sql.exec(
			`SELECT * FROM outbox WHERE status = 'queued' AND next_attempt_at <= ?1
			 ORDER BY next_attempt_at, created_at LIMIT 20`,
			nowMs,
		)] as unknown as OutboxRow[];

		for (const row of due) {
			attempted.push(row.id);
			this.sql.exec(`UPDATE outbox SET status = 'sending' WHERE id = ?`, row.id);
			const result = await this.attempt(row, nowMs);
			const paused = this.apply(row, result, nowMs, setDeliveryStatus);
			if (paused) break;
		}
		return attempted;
	}

	private async attempt(row: OutboxRow, nowMs: number): Promise<SendResult> {
		const provider = this.getProvider();
		if (!provider) {
			return { ok: false, action: "fail", status: 0, code: "not_configured", message: "RESEND_API_KEY is not set" };
		}
		const payload = JSON.parse(row.payload) as OutboxPayload;

		const attachments: OutgoingMessage["attachments"] = [];
		for (const ref of payload.attachments ?? []) {
			const obj = await this.bucket.get(ref.key);
			if (!obj) {
				return { ok: false, action: "fail", status: 0, code: "attachment_missing", message: `Attachment not found: ${ref.filename}` };
			}
			attachments.push({
				filename: ref.filename,
				contentType: ref.contentType,
				content: bytesToBase64(new Uint8Array(await obj.arrayBuffer())),
				...(ref.contentId ? { contentId: ref.contentId } : {}),
			});
		}

		// Count the recipients against the day the send actually happens.
		this.sql.exec(`UPDATE outbox SET quota_day = ?1 WHERE id = ?2`, utcDay(nowMs), row.id);

		return provider.send(
			{
				from: payload.from,
				to: payload.to,
				cc: payload.cc,
				bcc: payload.bcc,
				subject: payload.subject,
				html: payload.html,
				text: payload.text,
				headers: payload.headers,
				attachments,
				tags: { outbox_id: row.id },
			},
			{ idempotencyKey: row.id },
		);
	}

	/** Apply a send result. Returns true if the outbox is now paused. */
	private apply(
		row: OutboxRow,
		result: SendResult,
		nowMs: number,
		setDeliveryStatus: (id: string, status: string) => void,
	): boolean {
		if (result.ok) {
			this.sql.exec(
				`UPDATE outbox SET status = 'sent', provider_id = ?1, sent_at = ?2, attempts = attempts + 1, last_error = NULL WHERE id = ?3`,
				result.providerId,
				nowMs,
				row.id,
			);
			if (result.dailyQuotaUsed !== undefined) {
				this.setMeta("quota_day", utcDay(nowMs));
				this.setMeta("quota_used", String(result.dailyQuotaUsed));
			}
			setDeliveryStatus(row.id, "sent");
			return false;
		}

		const error = `${result.status} ${result.code}: ${result.message}`;
		if (result.action === "pause") {
			this.setMeta("paused_until", String(result.until));
			this.sql.exec(
				`UPDATE outbox SET status = 'queued', next_attempt_at = ?1, last_error = ?2 WHERE id = ?3`,
				result.until,
				error,
				row.id,
			);
			setDeliveryStatus(row.id, "queued");
			return true;
		}

		const attempts = row.attempts + 1;
		if (result.action === "retry" && attempts < MAX_ATTEMPTS) {
			const next = nowMs + (result.retryAfterMs ?? backoffMs(attempts));
			this.sql.exec(
				`UPDATE outbox SET status = 'queued', attempts = ?1, next_attempt_at = ?2, last_error = ?3 WHERE id = ?4`,
				attempts,
				next,
				error,
				row.id,
			);
			setDeliveryStatus(row.id, "queued");
			return false;
		}

		this.sql.exec(
			`UPDATE outbox SET status = 'failed', attempts = ?1, last_error = ?2 WHERE id = ?3`,
			attempts,
			error,
			row.id,
		);
		setDeliveryStatus(row.id, "failed");
		return false;
	}

	// ── Webhooks ───────────────────────────────────────────────────

	/** Record a delivery once. Returns false if this svix-id was already seen. */
	markWebhookSeen(svixId: string, nowMs: number): boolean {
		const seen = [...this.sql.exec(`SELECT 1 FROM webhook_events WHERE svix_id = ?`, svixId)].length > 0;
		if (seen) return false;
		this.sql.exec(`INSERT INTO webhook_events (svix_id, received_at) VALUES (?1, ?2)`, svixId, nowMs);
		this.sql.exec(`DELETE FROM webhook_events WHERE received_at < ?`, nowMs - WEBHOOK_DEDUPE_RETENTION_MS);
		return true;
	}

	/**
	 * Apply an `email.*` event. Returns the outbox/email id it matched, the new
	 * delivery status (if it advanced) and the provider Message-ID (from email.sent etc.).
	 */
	resolveEmailEvent(
		event: WebhookEvent,
		currentStatus: (id: string) => string | null,
	): { id: string; status: string | null; messageId: string | null } | null {
		const status = EVENT_TO_STATUS[event.type];
		if (!status || !event.data) return null;

		let id = tagValue(event.data.tags, "outbox_id") ?? null;
		if (id && !this.get(id)) id = null;
		if (!id && event.data.email_id) {
			const row = [...this.sql.exec(`SELECT id FROM outbox WHERE provider_id = ?`, event.data.email_id)][0] as
				| { id: string }
				| undefined;
			id = row?.id ?? null;
		}
		if (!id) return null;

		const current = currentStatus(id);
		const advance = (DELIVERY_RANK[status] ?? 0) >= (DELIVERY_RANK[current ?? "queued"] ?? 0);
		const messageId = typeof event.data.message_id === "string" && event.data.message_id
			? stripAngles(event.data.message_id)
			: null;
		return { id, status: advance ? status : null, messageId };
	}

	applySuppression(event: WebhookEvent) {
		const email = event.data?.email?.toLowerCase();
		if (!email) return;
		if (event.type === "suppression.added") {
			this.sql.exec(
				`INSERT INTO suppressed_recipients (email, origin, created_at) VALUES (?1, ?2, ?3)
				 ON CONFLICT(email) DO UPDATE SET origin = excluded.origin, created_at = excluded.created_at`,
				email,
				event.data?.origin ?? null,
				event.data?.created_at ?? event.created_at ?? null,
			);
		} else if (event.type === "suppression.removed") {
			this.sql.exec(`DELETE FROM suppressed_recipients WHERE email = ?`, email);
		}
	}

	suppressed(emails: string[]): Array<{ email: string; origin: string | null }> {
		const out: Array<{ email: string; origin: string | null }> = [];
		for (const e of new Set(emails.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
			const row = [...this.sql.exec(`SELECT email, origin FROM suppressed_recipients WHERE email = ?`, e)][0] as
				| { email: string; origin: string | null }
				| undefined;
			if (row) out.push(row);
		}
		return out;
	}
}
