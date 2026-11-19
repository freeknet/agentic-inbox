/**
 * Outbound email provider abstraction.
 *
 * The outbox (MailboxDO) talks to a provider through this interface so the
 * transport can be swapped or faked. `send` never throws for provider-side
 * errors: it classifies them into an action the outbox applies.
 */

export interface OutgoingAttachment {
	filename: string;
	contentType: string;
	/** base64-encoded bytes */
	content: string;
	/** Set for inline images referenced as `cid:` from the HTML body. */
	contentId?: string;
}

export interface OutgoingMessage {
	/** `"Name <addr>"` or a bare address. */
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	replyTo?: string;
	subject: string;
	html?: string;
	text?: string;
	headers?: Record<string, string>;
	attachments?: OutgoingAttachment[];
	/** Echoed back in webhook payloads. Values: ASCII letters, digits, `_`, `-`. */
	tags?: Record<string, string>;
}

interface ErrorInfo {
	status: number;
	code: string;
	message: string;
}

export type SendResult =
	| { ok: true; providerId: string; dailyQuotaUsed?: number }
	/** Transient: try again after `retryAfterMs`, or the outbox's own backoff. */
	| ({ ok: false; action: "retry"; retryAfterMs?: number } & ErrorInfo)
	/** Quota exhausted: hold the whole outbox until `until` (epoch ms). */
	| ({ ok: false; action: "pause"; until: number } & ErrorInfo)
	/** Permanent: do not retry. */
	| ({ ok: false; action: "fail" } & ErrorInfo);

export interface EmailProvider {
	send(message: OutgoingMessage, opts: { idempotencyKey: string }): Promise<SendResult>;
}

// ── UTC calendar helpers (Resend quotas reset on UTC day / month) ──

/** `YYYY-MM-DD` of the UTC day containing `ms`. */
export function utcDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function nextUtcMidnight(ms: number): number {
	const d = new Date(ms);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function nextUtcMonthStart(ms: number): number {
	const d = new Date(ms);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
