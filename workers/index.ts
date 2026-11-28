// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { parseSendAt, queueSend } from "./lib/send";
import { deleteUpload, storeUpload } from "./lib/uploads";
import { UNDO_DELAY_MS, type WebhookEvent } from "./durableObject/outbox";
import { verifySvixSignature } from "./lib/svix";
import type { AutoReplySettings } from "./durableObject/autoreply";
import { isAgentModel } from "../shared/ai-models";
import {
	validateSender,
	SenderValidationError,
	listMailboxes,
} from "./lib/email-helpers";
import { SendEmailRequestSchema } from "./lib/schemas";
import { handleReplyEmail, handleForwardEmail } from "./routes/reply-forward";
import { registerDriveRoutes } from "./routes/drive";
import { notifyNewMail, registerPushRoutes } from "./routes/push";
import type { Env } from "./types";
import { requireMailbox, type MailboxContext } from "./lib/mailbox";
import { sameOriginOnly } from "./lib/same-origin";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

// B13: settings were stored as arbitrary JSON. Unknown keys are dropped.
const MailboxSettingsSchema = z.object({
	fromName: z.string().max(200).optional(),
	forwarding: z.object({ enabled: z.boolean(), email: z.union([z.email(), z.literal("")]) }).optional(),
	signature: z.object({ enabled: z.boolean(), text: z.string().max(10_000), html: z.string().max(50_000).optional() }).optional(),
	autoReply: z.object({
		enabled: z.boolean(),
		subject: z.string().max(500),
		message: z.string().max(20_000),
		startsAt: z.union([z.iso.datetime({ offset: true }), z.literal("")]).optional(),
		endsAt: z.union([z.iso.datetime({ offset: true }), z.literal("")]).optional(),
	}).optional(),
	agentSystemPrompt: z.string().max(20_000).optional(),
	agent: z.object({
		/** Draft a reply to every inbound email (costs Neurons). Off by default (plan §E3). */
		autoDraft: z.boolean(),
		model: z.string().refine(isAgentModel, "Unknown model"),
	}).optional(),
});

const CreateMailboxBody = z.object({
	email: z.email(),
	name: z.string().min(1),
	settings: MailboxSettingsSchema.optional(),
});

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
});

// -- Helpers --------------------------------------------------------

function slugify(text: string) { // can return "" for non-alphanumeric input
	return text.toString().toLowerCase()
		.replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
app.use("/api/*", cors({
	origin: (origin) => {
		// Same-origin requests have no Origin header — allow them.
		if (!origin) return origin;
		// In development, allow localhost for Vite dev server.
		try {
			const url = new URL(origin);
			if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
		} catch { /* invalid origin */ }
		// Returning undefined omits Access-Control-Allow-Origin, which only stops
		// another site *reading* responses. Stopping it *making* requests is
		// sameOriginOnly's job, below.
		return undefined;
	},
}));
// CSRF: Access authenticates by cookie, so refuse cross-site writes (and in
// app.ts, cross-site WebSocket upgrades). The Svix webhook sends no Origin.
app.use("*", sameOriginOnly);
app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);

// Invalid request bodies (schema.parse throws ZodError) are client errors, not 500s.
app.onError((err, c) => {
	if (err instanceof z.ZodError) {
		return c.json({ error: "Invalid request", issues: z.treeifyError(err) }, 400);
	}
	console.error("Unhandled API error:", err);
	return c.json({ error: "Internal Server Error" }, 500);
});

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", (c) => {
	const domainsRaw = c.env.DOMAINS || "";
	const domains = domainsRaw.split(",").map((d) => d.trim()).filter(Boolean);
	const emailAddresses = c.env.EMAIL_ADDRESSES ?? [];
	return c.json({ domains, emailAddresses });
});

// -- Mailboxes ------------------------------------------------------

async function deletePrefix(bucket: R2Bucket, prefix: string) {
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix, cursor });
		const keys = page.objects.map((o) => o.key);
		if (keys.length) await bucket.delete(keys);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
}

app.get("/api/v1/mailboxes", async (c) => {
	const allMailboxes = await listMailboxes(c.env.BUCKET);
	return c.json(allMailboxes.map((m) => ({ ...m, name: m.id })));
});

app.post("/api/v1/mailboxes", async (c) => {
	const { name, settings, email: rawEmail } = CreateMailboxBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const allowedAddresses = (c.env.EMAIL_ADDRESSES ?? []) as string[];
	if (allowedAddresses.length > 0 && !allowedAddresses.map((a) => a.toLowerCase()).includes(email)) {
		return c.json({ error: "Mailbox creation is restricted to configured EMAIL_ADDRESSES" }, 403);
	}
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	const defaultSettings = { fromName: name, forwarding: { enabled: false, email: "" }, signature: { enabled: false, text: "" }, autoReply: { enabled: false, subject: "", message: "" } };
	const finalSettings = { ...defaultSettings, ...settings };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	return c.json({ id: email, email, name, settings: finalSettings }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: await obj.json() });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { settings } = z.object({ settings: MailboxSettingsSchema }).parse(await c.req.json());
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings });
});

app.delete("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	// Purge the mailbox's Durable Object data, then its R2 blobs, then the record.
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(mailboxId));
	const emailIds = await stub.purge();
	for (const id of emailIds) await deletePrefix(c.env.BUCKET, `attachments/${id}/`);
	await deletePrefix(c.env.BUCKET, `raw/${mailboxId}/`);
	await c.env.BUCKET.delete(key);
	return c.body(null, 204);
});

// -- Emails ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as any;
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const stub = c.var.mailboxStub;

	if (threaded && folder) {
		const emails = await (stub as any).getThreadedEmails({ folder, page, limit });
		const totalCount = await (stub as any).countThreadedEmails(folder);
		return c.json({ emails, totalCount });
	}
	const emails = await stub.getEmails({ folder, thread_id, page, limit, sortColumn, sortDirection });
	if (folder) {
		const totalCount = await stub.countEmails({ folder, thread_id });
		return c.json({ emails, totalCount });
	}
	return c.json(emails);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, in_reply_to, references, thread_id, draft_id, send_at } = body;

	try {
		validateSender(to, from, mailboxId);
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const result = await queueSend(c.env, c.var.mailboxStub, {
		mailboxId, from, to, cc, bcc, subject, html, text, attachments,
		inReplyTo: in_reply_to ?? null, references: references ?? [], threadId: thread_id ?? null,
		draftId: draft_id ?? null, delayMs: UNDO_DELAY_MS, sendAt: parseSendAt(send_at),
	});
	if (!result.ok) return c.json({ error: result.error }, result.status);
	return c.json({ id: result.id, status: "queued", send_at: result.sendAt }, 202);
});

// Outgoing attachments: raw PUT, streamed to R2 (plan §A5). 411 without Content-Length.
app.put("/api/v1/mailboxes/:mailboxId/uploads", async (c: AppContext) => {
	const r = await storeUpload(c.env, c.req.param("mailboxId")!, c.req.raw);
	if (!r.ok) return c.json({ error: r.error }, r.status);
	return c.json(r.upload, 201);
});

app.delete("/api/v1/mailboxes/:mailboxId/uploads/:uploadId", async (c: AppContext) => {
	const ok = await deleteUpload(c.env, c.req.param("mailboxId")!, c.req.param("uploadId")!);
	return ok ? c.body(null, 204) : c.json({ error: "Invalid upload id" }, 400);
});

// Undo send: only while the message is still inside its undo window.
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/cancel-send", async (c: AppContext) => {
	const r = await c.var.mailboxStub.cancelOutgoing(c.req.param("id")!);
	if (r === "not_found") return c.json({ error: "Not in outbox" }, 404);
	if (r === "too_late") return c.json({ error: "Already sent" }, 409);
	return c.json({ id: c.req.param("id"), status: "draft" });
});

app.get("/api/v1/mailboxes/:mailboxId/outbox/:id", async (c: AppContext) => {
	const entry = await c.var.mailboxStub.getOutboxEntry(c.req.param("id")!);
	return entry ? c.json(entry) : c.json({ error: "Not found" }, 404);
});

app.get("/api/v1/mailboxes/:mailboxId/stats", async (c: AppContext) => {
	const stub = c.var.mailboxStub;
	const [storage, quota, ai] = await Promise.all([stub.getStorageStats(), stub.getSendQuota(), stub.getAiUsage()]);
	return c.json({ storage, quota, ai });
});

app.get("/api/v1/mailboxes/:mailboxId/send-quota", async (c: AppContext) => {
	return c.json(await c.var.mailboxStub.getSendQuota());
});

// Compose-time warning: which of these recipients are on Resend's suppression list.
app.post("/api/v1/mailboxes/:mailboxId/suppressions/check", async (c: AppContext) => {
	const { emails } = z.object({ emails: z.array(z.string()).max(200) }).parse(await c.req.json());
	return c.json({ suppressed: await c.var.mailboxStub.checkSuppressed(emails) });
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	await stub.saveDraft({
		id: messageId, subject: subject || "", sender: mailboxId.toLowerCase(),
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, draft_id ?? null);
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = (await c.req.json()) as { read?: boolean; starred?: boolean };
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	if (attachments.length > 0) await c.env.BUCKET.delete(attachments.map((att: any) => `attachments/${id}/${att.id}/${att.filename}`));
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const { folderId } = (await c.req.json()) as { folderId: string };
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return c.json(await (c.var.mailboxStub as any).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", handleReplyEmail);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", handleForwardEmail);

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => c.json(await c.var.mailboxStub.getFolders()));

// Recipient suggestions for compose.
app.get("/api/v1/mailboxes/:mailboxId/contacts", async (c: AppContext) => c.json(await c.var.mailboxStub.getContacts()));

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub as any;
	const emails = await stub.searchEmails({ ...searchOpts, page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const totalCount = await stub.countSearchResults(searchOpts);
	return c.json({ emails, totalCount });
});

// -- Drive (agentic-drive over a service binding; optional) --------

registerDriveRoutes(app);
registerPushRoutes(app);

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment || attachment.email_id !== emailId) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	return new Response(obj.body, { headers: attachmentHeaders(attachment.mimetype, attachment.filename) });
});

/**
 * Headers for an attachment download. The type and name come from whoever
 * sent the email, so: always a download, never sniffed into something else,
 * text never served as a page, and a sandbox CSP in case a browser renders it
 * anyway. Header values must be Latin-1, so the plain filename is ASCII-only
 * and the real one goes in filename*.
 */
export function attachmentHeaders(mimetype: string, filename: string): Headers {
	const m = (mimetype ?? "").trim().toLowerCase();
	const type = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(m) ? m : "application/octet-stream";
	const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
	return new Headers({
		"Content-Type": type.startsWith("text/") ? "text/plain; charset=utf-8" : type,
		"Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "sandbox; default-src 'none'",
		"Cache-Control": "private, no-store",
	});
}

// -- Resend webhooks ------------------------------------------------
// Reached through an Access Bypass app on this exact path; the Access JWT
// middleware in app.ts skips it (B3). The Svix signature is the only auth.

const addressOf = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

app.post("/webhooks/resend", async (c) => {
	const secret = c.env.RESEND_WEBHOOK_SECRET;
	if (!secret) return c.json({ error: "Webhook secret not configured" }, 500);

	const raw = await c.req.text();
	const svixId = c.req.header("svix-id");
	const ok = await verifySvixSignature(secret, {
		id: svixId,
		timestamp: c.req.header("svix-timestamp"),
		signature: c.req.header("svix-signature"),
	}, raw);
	if (!ok || !svixId) return c.json({ error: "Invalid signature" }, 401);

	let event: WebhookEvent;
	try {
		event = JSON.parse(raw) as WebhookEvent;
	} catch {
		return c.json({ error: "Invalid JSON" }, 400);
	}
	if (typeof event?.type !== "string") return c.json({ error: "Missing type" }, 400);

	// Suppressions are team-wide: mirror them into every mailbox. Email events
	// belong to the mailbox they were sent from.
	let targets: string[];
	if (event.type.startsWith("suppression.")) {
		targets = (await listMailboxes(c.env.BUCKET)).map((m) => m.id);
	} else {
		const from = typeof event.data?.from === "string" ? addressOf(event.data.from) : "";
		targets = from && (await c.env.BUCKET.head(`mailboxes/${from}.json`)) ? [from] : [];
	}

	const results: string[] = [];
	for (const mailboxId of targets) {
		const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(mailboxId));
		results.push(await stub.applyWebhook(svixId, event));
	}
	return c.json({ received: true, results });
});

// -- Receive inbound email ------------------------------------------
// Design A (plan §A2): stream the raw message into R2 without buffering or
// parsing it here (a plain Worker gets ~10 ms CPU on Free), then let the
// mailbox's Durable Object parse it.

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;

/** The parts of ForwardableEmailMessage this handler uses. */
export interface InboundMessage {
	from: string;
	to: string;
	raw: ReadableStream<Uint8Array>;
	rawSize: number;
	/** False when Email Routing won't forward this message (e.g. it already looped). */
	canBeForwarded?: boolean;
	setReject(reason: string): void;
	/** Send the original message on unchanged; the address must be a verified Email Routing destination. */
	forward(rcptTo: string, headers?: Headers): Promise<unknown>;
}

async function receiveEmail(message: InboundMessage, env: Env, ctx: ExecutionContext) {
	// Route on the SMTP envelope recipient, not header To/Cc, so Cc, Bcc and
	// list mail arrive and nothing is guessed from headers.
	const mailboxId = message.to.trim().toLowerCase();
	const allowed = ((env.EMAIL_ADDRESSES ?? []) as string[]).map((a) => a.toLowerCase());
	const mailboxObj = allowed.length > 0 && !allowed.includes(mailboxId) ? null : await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!mailboxObj) {
		message.setReject("550 5.1.1 No such user here");
		return;
	}
	if (message.rawSize > MAX_EMAIL_SIZE) {
		message.setReject("552 5.3.4 Message size exceeds fixed maximum message size");
		return;
	}
	if (message.rawSize <= 0) throw new Error(`Invalid message size: ${message.rawSize}`);

	const id = crypto.randomUUID();
	const key = `raw/${mailboxId}/${id}.eml`;
	// R2 needs a known length for a streamed body; FixedLengthStream also
	// rejects a stream that doesn't match the declared size.
	const { readable, writable } = new FixedLengthStream(message.rawSize);
	await Promise.all([message.raw.pipeTo(writable), env.BUCKET.put(key, readable)]);

	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
	const settings = (await mailboxObj.json().catch(() => ({}))) as {
		autoReply?: AutoReplySettings;
		fromName?: string;
		agent?: { autoDraft?: boolean };
		forwarding?: { enabled?: boolean; email?: string };
	};
	const stored = await stub.ingestRaw({ key, id, envelopeTo: mailboxId, envelopeFrom: message.from, autoReply: settings.autoReply, fromName: settings.fromName });
	await forwardCopy(message, mailboxId, settings.forwarding);
	ctx.waitUntil(notifyNewMail(env, stub, mailboxId, stored));

	// Auto-draft is opt-in: every draft costs Neurons from the 10,000/day free allocation.
	if (!settings.agent?.autoDraft) return;
	const agentStub = env.EMAIL_AGENT.get(env.EMAIL_AGENT.idFromName(mailboxId));
	ctx.waitUntil(agentStub.fetch(new Request("https://agents/onNewEmail", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ mailboxId, emailId: stored.emailId, sender: stored.sender, subject: stored.subject, threadId: stored.threadId }),
	})).catch((e) => console.error("Auto-draft trigger failed:", (e as Error).message)));
}

/**
 * Forwarding (Settings): keep the message here and also send the original on
 * to another address through Email Routing, so DKIM, headers and attachments
 * stay intact and it costs no Resend quota. Email Routing only forwards to
 * verified destination addresses; a failure is logged and the stored copy is
 * kept, so the sender never sees a bounce.
 */
async function forwardCopy(message: InboundMessage, mailboxId: string, forwarding?: { enabled?: boolean; email?: string }) {
	const to = forwarding?.email?.trim().toLowerCase();
	if (!forwarding?.enabled || !to || to === mailboxId || message.canBeForwarded === false) return;
	try {
		await message.forward(to, new Headers({ "X-Forwarded-For": mailboxId }));
	} catch (e) {
		console.error(`Forward to ${to} failed (is it a verified Email Routing destination?):`, (e as Error).message);
	}
}

export { app, receiveEmail };
