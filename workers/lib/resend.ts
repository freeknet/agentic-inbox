/**
 * Resend implementation of EmailProvider, over plain fetch.
 *
 * Error handling follows docs/FORK_PLAN_v2.md §A3:
 * - 429 rate_limit_exceeded           → retry after `retry-after`
 * - 429 daily/monthly_quota_exceeded  → pause until 00:00 UTC / next month
 * - 5xx, network errors               → retry with backoff
 * - 409 concurrent_idempotent_requests → retry
 * - every other 4xx                   → fail
 */
import {
	type EmailProvider,
	type OutgoingMessage,
	type SendResult,
	nextUtcMidnight,
	nextUtcMonthStart,
} from "./email-provider";

const RESEND_API = "https://api.resend.com";
// Resend rejects requests without a User-Agent ("403 error code 1010").
const USER_AGENT = "agentic-inbox/1.0";

export function createResendProvider(
	apiKey: string,
	now: () => number = Date.now,
): EmailProvider {
	return {
		async send(message: OutgoingMessage, { idempotencyKey }): Promise<SendResult> {
			const body: Record<string, unknown> = {
				from: message.from,
				to: message.to,
				subject: message.subject,
			};
			if (message.cc?.length) body.cc = message.cc;
			if (message.bcc?.length) body.bcc = message.bcc;
			if (message.replyTo) body.reply_to = message.replyTo;
			if (message.html) body.html = message.html;
			if (message.text) body.text = message.text;
			if (message.headers && Object.keys(message.headers).length > 0) body.headers = message.headers;
			if (message.tags) {
				body.tags = Object.entries(message.tags).map(([name, value]) => ({ name, value }));
			}
			if (message.attachments?.length) {
				body.attachments = message.attachments.map((a) => ({
					filename: a.filename,
					content: a.content,
					content_type: a.contentType,
					...(a.contentId ? { content_id: a.contentId } : {}),
				}));
			}

			let res: Response;
			try {
				res = await fetch(`${RESEND_API}/emails`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
						"User-Agent": USER_AGENT,
						"Idempotency-Key": idempotencyKey,
					},
					body: JSON.stringify(body),
				});
			} catch (e) {
				return { ok: false, action: "retry", status: 0, code: "network_error", message: (e as Error).message };
			}

			const quotaHeader = res.headers.get("x-resend-daily-quota");
			const dailyQuotaUsed = quotaHeader !== null && quotaHeader !== "" && !Number.isNaN(Number(quotaHeader))
				? Number(quotaHeader)
				: undefined;

			const payload = (await res.json().catch(() => null)) as
				| { id?: string; name?: string; message?: string }
				| null;

			if (res.ok && payload?.id) {
				return { ok: true, providerId: payload.id, dailyQuotaUsed };
			}

			const err = {
				status: res.status,
				code: payload?.name ?? (res.ok ? "missing_id" : `http_${res.status}`),
				message: payload?.message ?? res.statusText,
			};
			return classify(err, res.headers.get("retry-after"), now());
		},
	};
}

function classify(
	err: { status: number; code: string; message: string },
	retryAfter: string | null,
	nowMs: number,
): SendResult {
	if (err.status === 429) {
		if (err.code === "daily_quota_exceeded") return { ok: false, action: "pause", until: nextUtcMidnight(nowMs), ...err };
		if (err.code === "monthly_quota_exceeded") return { ok: false, action: "pause", until: nextUtcMonthStart(nowMs), ...err };
		const secs = Number(retryAfter);
		return { ok: false, action: "retry", ...(retryAfter && secs >= 0 ? { retryAfterMs: secs * 1000 } : {}), ...err };
	}
	if (err.status === 409) {
		return err.code === "concurrent_idempotent_requests"
			? { ok: false, action: "retry", ...err }
			: { ok: false, action: "fail", ...err };
	}
	if (err.status >= 500 || err.status < 400) return { ok: false, action: "retry", ...err };
	return { ok: false, action: "fail", ...err };
}
