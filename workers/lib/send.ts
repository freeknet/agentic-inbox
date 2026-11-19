/**
 * Worker-side entry point for every outgoing message (compose, reply,
 * forward, agent, MCP). Stores attachments in R2, then hands the message to
 * the mailbox's outbox, which sends it from a Durable Object alarm.
 */
import type { MailboxDO } from "../durableObject";
import { storeAttachments, type StoredAttachment } from "./attachments";
import { attachmentKey, buildOutgoing, newMessageIds } from "./outgoing";
import { MAX_MESSAGE_ATTACHMENT_BYTES, copyObject, safeFilename, uploadKey } from "./uploads";
import type { Env } from "../types";

/** Inline base64 is decoded in the Worker, so keep it small; larger files go through PUT /uploads. */
const MAX_INLINE_BASE64_BYTES = 1024 * 1024;
const R2_COPY_CONCURRENCY = 6;

export type Base64Attachment = {
	content: string;
	filename: string;
	type: string;
	disposition: string;
	contentId?: string;
};
export type UploadAttachment = { upload_id: string; disposition?: string; contentId?: string };
export type InputAttachment = Base64Attachment | UploadAttachment;

/** An R2 object to copy into the message: an upload (moved) or a forwarded attachment (copied). */
export interface SourceAttachment {
	key: string;
	filename: string;
	type: string;
	size: number;
	disposition: string;
	contentId: string | null;
	move: boolean;
}

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
	attachments?: InputAttachment[];
	/** Attachments of another message to include, e.g. when forwarding. */
	copyAttachments?: SourceAttachment[];
	inReplyTo?: string | null;
	references?: string[];
	threadId?: string | null;
	draftId?: string | null;
	/** Undo window. Interactive sends use UNDO_DELAY_MS; agent/MCP sends use 0. */
	delayMs: number;
	/** Send later: epoch ms. The message waits in the outbox and can be cancelled until then. */
	sendAt?: number | null;
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
	const ids = newMessageIds(fromEmail);
	const { messageId } = ids;

	const resolved = await resolveAttachments(env, input);
	if (!resolved.ok) return { ok: false, error: resolved.error, status: 400 };

	const stored = await storeAttachments(env.BUCKET, messageId, resolved.base64);
	stored.push(...(await copySources(env.BUCKET, messageId, resolved.sources)));
	const keys = stored.map(attachmentKey);

	const { email, payload } = buildOutgoing({
		fromHeader: formatFrom(input.from),
		fromEmail,
		to,
		cc,
		bcc,
		subject: input.subject,
		html: input.html,
		text: input.text,
		inReplyTo: input.inReplyTo,
		references: input.references,
		threadId: input.threadId,
		ids,
		attachments: stored,
	});

	const delayMs = input.sendAt ? Math.max(input.delayMs, input.sendAt - Date.now()) : input.delayMs;
	const result = await stub.enqueueOutgoing({
		email,
		attachments: stored,
		payload,
		delayMs,
		draftId: input.draftId ?? null,
	});

	if (!result.ok && keys.length > 0) await env.BUCKET.delete(keys);
	if (result.ok) {
		const moved = resolved.sources.filter((s) => s.move).map((s) => s.key);
		if (moved.length > 0) await env.BUCKET.delete(moved);
	}
	return result;
}

type Resolved =
	| { ok: true; base64: Base64Attachment[]; sources: SourceAttachment[] }
	| { ok: false; error: string };

async function resolveAttachments(env: Env, input: QueueSendInput): Promise<Resolved> {
	const base64: Base64Attachment[] = [];
	const sources: SourceAttachment[] = [...(input.copyAttachments ?? [])];
	let inlineBytes = 0;
	for (const att of input.attachments ?? []) {
		if ("upload_id" in att) {
			const key = uploadKey(input.mailboxId, att.upload_id);
			const head = key ? await env.BUCKET.head(key) : null;
			if (!key || !head) return { ok: false, error: "An attachment upload was not found or has expired; attach the file again" };
			sources.push({
				key,
				filename: safeFilename(head.customMetadata?.filename),
				type: head.httpMetadata?.contentType || "application/octet-stream",
				size: head.size,
				disposition: att.disposition ?? "attachment",
				contentId: att.contentId ?? null,
				move: true,
			});
		} else {
			inlineBytes += Math.floor((att.content.length * 3) / 4);
			base64.push(att);
		}
	}
	if (inlineBytes > MAX_INLINE_BASE64_BYTES) {
		return { ok: false, error: "Inline attachment content is limited to 1 MB; upload larger files first" };
	}
	const total = inlineBytes + sources.reduce((n, s) => n + s.size, 0);
	if (total > MAX_MESSAGE_ATTACHMENT_BYTES) {
		return { ok: false, error: `Attachments are limited to ${MAX_MESSAGE_ATTACHMENT_BYTES / 1024 / 1024} MB per message` };
	}
	return { ok: true, base64, sources };
}

async function copySources(bucket: R2Bucket, emailId: string, sources: SourceAttachment[]): Promise<StoredAttachment[]> {
	const out: StoredAttachment[] = [];
	for (let i = 0; i < sources.length; i += R2_COPY_CONCURRENCY) {
		const batch = sources.slice(i, i + R2_COPY_CONCURRENCY);
		out.push(
			...(await Promise.all(
				batch.map(async (s) => {
					const id = crypto.randomUUID();
					const obj = await copyObject(bucket, s.key, `attachments/${emailId}/${id}/${s.filename}`);
					if (!obj) throw new Error(`Attachment source missing: ${s.filename}`);
					return {
						id,
						email_id: emailId,
						filename: s.filename,
						mimetype: s.type,
						size: obj.size,
						content_id: s.contentId,
						disposition: s.disposition,
					};
				}),
			)),
		);
	}
	return out;
}
