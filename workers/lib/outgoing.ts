/**
 * Builds the Sent-folder row and the outbox payload for an outgoing message.
 * Pure (no bindings), so both the Worker (queueSend) and MailboxDO (auto-reply)
 * use it.
 */
import type { StoredAttachment } from "./attachments";
import { buildThreadingHeaders, generateMessageId, stripHtmlToText } from "./email-helpers";
import type { OutboxPayload } from "../durableObject/outbox";

export interface OutgoingParts {
	fromHeader: string;
	fromEmail: string;
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	html?: string;
	text?: string;
	inReplyTo?: string | null;
	references?: string[];
	threadId?: string | null;
	/** Extra headers such as Auto-Submitted. */
	headers?: Record<string, string>;
	/** Pre-generated id, when attachments were stored under it before building. */
	ids?: { messageId: string; outgoingMessageId: string };
	attachments?: StoredAttachment[];
}

export function newMessageIds(fromEmail: string) {
	return generateMessageId(fromEmail.split("@")[1] ?? "localhost");
}

export function attachmentKey(a: StoredAttachment): string {
	return `attachments/${a.email_id}/${a.id}/${a.filename}`;
}

export function buildOutgoing(p: OutgoingParts) {
	const { messageId, outgoingMessageId } = p.ids ?? newMessageIds(p.fromEmail);
	const references = p.references ?? [];
	const stored = p.attachments ?? [];
	const now = new Date().toISOString();
	const headers = {
		...(p.inReplyTo ? buildThreadingHeaders(p.inReplyTo, references) : {}),
		...(p.headers ?? {}),
	};

	const payload: OutboxPayload = {
		from: p.fromHeader,
		to: p.to,
		...(p.cc.length ? { cc: p.cc } : {}),
		...(p.bcc.length ? { bcc: p.bcc } : {}),
		subject: p.subject,
		...(p.html ? { html: p.html } : {}),
		...(p.text ? { text: p.text } : {}),
		...(Object.keys(headers).length ? { headers } : {}),
		...(stored.length
			? {
					attachments: stored.map((a) => ({
						key: attachmentKey(a),
						filename: a.filename,
						contentType: a.mimetype,
						...(a.content_id && a.disposition === "inline" ? { contentId: a.content_id } : {}),
					})),
				}
			: {}),
	};

	const email = {
		id: messageId,
		subject: p.subject,
		sender: p.fromEmail,
		recipient: p.to.join(", ").toLowerCase(),
		cc: p.cc.length ? p.cc.join(", ").toLowerCase() : null,
		bcc: p.bcc.length ? p.bcc.join(", ").toLowerCase() : null,
		date: now,
		body: p.html || p.text || "",
		body_text: p.text || stripHtmlToText(p.html || ""),
		in_reply_to: p.inReplyTo ?? null,
		email_references: references.length ? JSON.stringify(references) : null,
		thread_id: p.threadId || p.inReplyTo || messageId,
		// Replaced by Resend's real Message-ID when the email.sent webhook arrives (B2).
		message_id: outgoingMessageId,
		raw_headers: JSON.stringify([
			{ key: "from", value: p.fromHeader },
			{ key: "to", value: p.to.join(", ") },
			...(p.cc.length ? [{ key: "cc", value: p.cc.join(", ") }] : []),
			...(p.bcc.length ? [{ key: "bcc", value: p.bcc.join(", ") }] : []),
			{ key: "subject", value: p.subject },
			{ key: "date", value: now },
			...Object.entries(headers).map(([key, value]) => ({ key: key.toLowerCase(), value })),
		]),
	};

	return { messageId, email, payload };
}
