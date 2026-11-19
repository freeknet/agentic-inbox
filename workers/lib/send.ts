/**
 * Worker-side entry point for every outgoing message (compose, reply,
 * forward, agent, MCP). Stores attachments in R2, then hands the message to
 * the mailbox's outbox, which sends it from a Durable Object alarm.
 */
import type { MailboxDO } from "../durableObject";
import type { OutboxPayload } from "../durableObject/outbox";
import { storeAttachments } from "./attachments";
import { buildThreadingHeaders, generateMessageId } from "./email-helpers";
import type { Env } from "../types";

export type Address = string | { email: string; name: string };
type AddressList = string | string[] | undefined | null;

export interface QueueSendInput {
	mailboxId: string;
	from: Address;
	to: string | string[];
	cc?: AddressList;
	bcc?: AddressList;
	subject: string;
	html?: string;
	text?: string;
	attachments?: {
		content: string;
		filename: string;
		type: string;
		disposition: string;
		contentId?: string;
	}[];
	inReplyTo?: string | null;
	references?: string[];
	threadId?: string | null;
	draftId?: string | null;
	/** Undo window. Interactive sends use UNDO_DELAY_MS; agent/MCP sends use 0. */
	delayMs: number;
}

export type QueueSendResult =
	| { ok: true; id: string; sendAt: number }
	| { ok: false; error: string; status: 400 | 429 };

function list(v: AddressList): string[] {
	if (!v) return [];
	const arr = Array.isArray(v) ? v : v.split(",");
	return arr.map((s) => s.trim()).filter(Boolean);
}

function formatFrom(from: Address): string {
	if (typeof from === "string") return from;
	const name = from.name.replace(/["\r\n<>]/g, "").trim();
	return name ? `"${name}" <${from.email}>` : from.email;
}

export async function queueSend(
	env: Env,
	stub: DurableObjectStub<MailboxDO>,
	input: QueueSendInput,
): Promise<QueueSendResult> {
	const fromEmail = (typeof input.from === "string" ? input.from : input.from.email).toLowerCase();
	const fromDomain = fromEmail.split("@")[1];
	if (!fromDomain) return { ok: false, error: "Invalid sender email address", status: 400 };

	const to = list(input.to);
	const cc = list(input.cc);
	const bcc = list(input.bcc);
	const references = input.references ?? [];
	const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
	const now = new Date().toISOString();
	const fromHeader = formatFrom(input.from);

	const stored = await storeAttachments(env.BUCKET, messageId, input.attachments);
	const keys = stored.map((a) => `attachments/${messageId}/${a.id}/${a.filename}`);

	const payload: OutboxPayload = {
		from: fromHeader,
		to,
		...(cc.length ? { cc } : {}),
		...(bcc.length ? { bcc } : {}),
		subject: input.subject,
		...(input.html ? { html: input.html } : {}),
		...(input.text ? { text: input.text } : {}),
		...(input.inReplyTo ? { headers: buildThreadingHeaders(input.inReplyTo, references) } : {}),
		...(stored.length
			? {
					attachments: stored.map((a, i) => ({
						key: keys[i],
						filename: a.filename,
						contentType: a.mimetype,
						...(a.content_id && a.disposition === "inline" ? { contentId: a.content_id } : {}),
					})),
				}
			: {}),
	};

	const result = await stub.enqueueOutgoing({
		email: {
			id: messageId,
			subject: input.subject,
			sender: fromEmail,
			recipient: to.join(", ").toLowerCase(),
			cc: cc.length ? cc.join(", ").toLowerCase() : null,
			bcc: bcc.length ? bcc.join(", ").toLowerCase() : null,
			date: now,
			body: input.html || input.text || "",
			in_reply_to: input.inReplyTo ?? null,
			email_references: references.length ? JSON.stringify(references) : null,
			thread_id: input.threadId || input.inReplyTo || messageId,
			// Replaced by Resend's real Message-ID when the email.sent webhook arrives (B2).
			message_id: outgoingMessageId,
			raw_headers: JSON.stringify([
				{ key: "from", value: fromHeader },
				{ key: "to", value: to.join(", ") },
				...(cc.length ? [{ key: "cc", value: cc.join(", ") }] : []),
				...(bcc.length ? [{ key: "bcc", value: bcc.join(", ") }] : []),
				{ key: "subject", value: input.subject },
				{ key: "date", value: now },
				...(input.inReplyTo ? [{ key: "in-reply-to", value: `<${input.inReplyTo}>` }] : []),
				...(references.length ? [{ key: "references", value: references.map((r) => `<${r}>`).join(" ") }] : []),
			]),
		},
		attachments: stored,
		payload,
		delayMs: input.delayMs,
		draftId: input.draftId ?? null,
	});

	if (!result.ok && keys.length > 0) await env.BUCKET.delete(keys);
	return result;
}
