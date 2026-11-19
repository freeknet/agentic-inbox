/**
 * Inbound parsing for MailboxDO (Design A, plan §A2): the Worker streams the
 * raw message into R2, and the Durable Object, which has a much larger CPU
 * budget on Workers Free (docs/probe-results.md), parses it here.
 */
import PostalMime from "postal-mime";
import { stripHtmlToText } from "../lib/email-helpers";

/** Upload attachments to R2 with at most this many writes in flight. */
const R2_WRITE_CONCURRENCY = 6;
/** Dates further in the future than this are treated as bogus. */
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

export interface ParsedInbound {
	subject: string;
	sender: string;
	/** Header To addresses, falling back to the envelope recipient. */
	recipient: string;
	cc: string | null;
	bcc: string | null;
	date: string;
	body: string;
	bodyText: string;
	messageId: string | null;
	inReplyTo: string | null;
	references: string[];
	rawHeaders: string;
	attachments: Array<{
		id: string;
		email_id: string;
		filename: string;
		mimetype: string;
		size: number;
		content_id: string | null;
		disposition: string;
	}>;
}

export function extractMsgId(s: string): string {
	const m = s.match(/<([^>]+)>/);
	return m ? m[1] : s.trim().split(/\s+/)[0];
}

/** The Date header as ISO-8601 UTC, or the receive time if missing, invalid or far in the future. */
export function normalizeDate(header: string | undefined, nowMs: number): string {
	if (header) {
		const t = Date.parse(header);
		if (!Number.isNaN(t) && t <= nowMs + MAX_FUTURE_SKEW_MS) return new Date(t).toISOString();
	}
	return new Date(nowMs).toISOString();
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const item = items[next++];
			await fn(item);
		}
	});
	await Promise.all(workers);
}

export async function parseInbound(
	raw: ArrayBuffer,
	emailId: string,
	envelopeTo: string,
	bucket: R2Bucket,
	nowMs: number = Date.now(),
): Promise<ParsedInbound> {
	const parsed = await PostalMime.parse(raw);

	const addrs = (list?: Array<{ address?: string }>) =>
		(list ?? []).map((a) => a.address?.toLowerCase()).filter(Boolean) as string[];
	const to = addrs(parsed.to as Array<{ address?: string }>);
	const cc = addrs(parsed.cc as Array<{ address?: string }>);
	const bcc = addrs(parsed.bcc as Array<{ address?: string }>);

	const attachments: ParsedInbound["attachments"] = [];
	const uploads: Array<{ key: string; content: ArrayBuffer | Uint8Array | string }> = [];
	for (const att of parsed.attachments ?? []) {
		const id = crypto.randomUUID();
		const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
		const content = att.content as ArrayBuffer | Uint8Array | string;
		uploads.push({ key: `attachments/${emailId}/${id}/${filename}`, content });
		attachments.push({
			id,
			email_id: emailId,
			filename,
			mimetype: att.mimeType,
			size: typeof content === "string" ? content.length : content.byteLength,
			content_id: att.contentId || null,
			disposition: att.disposition || "attachment",
		});
	}
	await mapLimit(uploads, R2_WRITE_CONCURRENCY, async (u) => {
		await bucket.put(u.key, u.content);
	});

	const html = parsed.html || "";
	const text = parsed.text || "";
	return {
		subject: parsed.subject || "",
		sender: (parsed.from?.address || "").toLowerCase(),
		recipient: (to.length ? to : [envelopeTo]).join(", "),
		cc: cc.join(", ") || null,
		bcc: bcc.join(", ") || null,
		date: normalizeDate(parsed.date, nowMs),
		body: html || text,
		bodyText: text || stripHtmlToText(html),
		messageId: parsed.messageId ? extractMsgId(parsed.messageId) : null,
		inReplyTo: parsed.inReplyTo ? extractMsgId(parsed.inReplyTo) : null,
		references: parsed.references ? parsed.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [],
		rawHeaders: JSON.stringify(parsed.headers),
		attachments,
	};
}
