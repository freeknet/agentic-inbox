/**
 * Vacation auto-reply, sent through the outbox (not message.reply(), which
 * needs DMARC-passing mail and allows one call per event, plan §A7).
 * Follows RFC 3834 §2: never answer automated mail, mailing lists or bounces,
 * and answer each sender at most once per interval.
 */

export interface AutoReplySettings {
	enabled: boolean;
	subject?: string;
	message?: string;
	/** ISO-8601; empty or missing means no bound. */
	startsAt?: string;
	endsAt?: string;
}

/** One reply per sender per this interval (RFC 3834 suggests a few days to a week). */
export const AUTO_REPLY_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000;

const ROBOT_LOCAL_PART = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|donotreply|bounces?|notifications?|noreply-.*|.*-noreply)$/i;

type Header = { key: string; value: string };

function header(headers: Header[], name: string): string | null {
	const h = headers.find((x) => x.key.toLowerCase() === name);
	return h ? String(h.value).trim() : null;
}

export type AutoReplyDecision = { reply: true } | { reply: false; reason: string };

export function decideAutoReply(input: {
	settings: AutoReplySettings | undefined;
	mailbox: string;
	sender: string;
	headers: Header[];
	nowMs: number;
	lastRepliedAt: number | null;
}): AutoReplyDecision {
	const { settings, mailbox, headers, nowMs } = input;
	const sender = input.sender.toLowerCase();
	if (!settings?.enabled) return { reply: false, reason: "disabled" };
	if (!settings.message?.trim()) return { reply: false, reason: "no message" };
	if (settings.startsAt && Date.parse(settings.startsAt) > nowMs) return { reply: false, reason: "not started" };
	if (settings.endsAt && Date.parse(settings.endsAt) < nowMs) return { reply: false, reason: "ended" };

	if (!sender || !sender.includes("@")) return { reply: false, reason: "no sender" };
	if (sender === mailbox.toLowerCase()) return { reply: false, reason: "self" };
	if (ROBOT_LOCAL_PART.test(sender.split("@")[0])) return { reply: false, reason: "automated sender" };

	const autoSubmitted = header(headers, "auto-submitted");
	if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return { reply: false, reason: "auto-submitted" };
	const precedence = header(headers, "precedence")?.toLowerCase();
	if (precedence && ["bulk", "list", "junk", "auto_reply"].includes(precedence)) return { reply: false, reason: "bulk" };
	if (header(headers, "list-id") || header(headers, "list-unsubscribe")) return { reply: false, reason: "mailing list" };
	const suppress = header(headers, "x-auto-response-suppress")?.toLowerCase() ?? "";
	if (/\b(all|oof|autoreply)\b/.test(suppress)) return { reply: false, reason: "suppressed by sender" };
	if (header(headers, "return-path") === "<>") return { reply: false, reason: "bounce" };

	if (input.lastRepliedAt !== null && nowMs - input.lastRepliedAt < AUTO_REPLY_INTERVAL_MS) {
		return { reply: false, reason: "recently replied" };
	}
	return { reply: true };
}

export function autoReplySubject(settings: AutoReplySettings, originalSubject: string): string {
	const custom = settings.subject?.trim();
	if (custom) return custom;
	const base = originalSubject.trim() || "your message";
	return /^re:/i.test(base) ? base : `Re: ${base}`;
}

export function textToHtml(text: string): string {
	const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	return `<div>${esc.replace(/\r?\n/g, "<br>")}</div>`;
}

/** Strip characters that would break a quoted display name. */
export function safeDisplayName(name: string | undefined): string {
	return (name ?? "").replace(/["\r\n<>]/g, "").trim();
}
