// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Context } from "hono";
import type { EmailFull } from "../lib/schemas";
import {
	validateSender,
	SenderValidationError,
	buildReferencesChain,
	resolveOriginalEmail,
} from "../lib/email-helpers";
import { SendEmailRequestSchema } from "../lib/schemas";
import { parseSendAt, queueSend, type SourceAttachment } from "../lib/send";
import { UNDO_DELAY_MS } from "../durableObject/outbox";
import type { MailboxContext } from "../lib/mailbox";

type AppContext = Context<MailboxContext>;

export async function handleReplyEmail(c: AppContext) {
	const mailboxId = c.req.param("mailboxId") ?? "";
	const id = c.req.param("id") ?? "";
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, draft_id, send_at } = body;

	const stub = c.var.mailboxStub;
	const rawOriginal = (await stub.getEmail(id)) as EmailFull | null;
	if (!rawOriginal) {
		return c.json({ error: "Original email not found" }, 404);
	}

	const originalEmail = await resolveOriginalEmail(stub, rawOriginal);
	const { originalMsgId, references, threadId } = buildReferencesChain(originalEmail);

	try {
		validateSender(to, from, mailboxId);
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const result = await queueSend(c.env, stub, {
		mailboxId, from, to, cc, bcc, subject, html, text, attachments,
		inReplyTo: originalMsgId, references, threadId,
		draftId: draft_id ?? null, delayMs: UNDO_DELAY_MS, sendAt: parseSendAt(send_at),
	});
	if (!result.ok) return c.json({ error: result.error }, result.status);

	await stub.markThreadRead(threadId);
	return c.json({ id: result.id, status: "queued", send_at: result.sendAt }, 202);
}

export async function handleForwardEmail(c: AppContext) {
	const mailboxId = c.req.param("mailboxId") ?? "";
	const id = c.req.param("id") ?? "";
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, draft_id, forward_attachment_ids, send_at } = body;

	const stub = c.var.mailboxStub;
	const rawOriginal = (await stub.getEmail(id)) as EmailFull | null;
	if (!rawOriginal) {
		return c.json({ error: "Original email not found" }, 404);
	}
	await resolveOriginalEmail(stub, rawOriginal);

	// Forward the original's files: all non-inline ones unless the client picked a subset.
	const wanted = forward_attachment_ids ? new Set(forward_attachment_ids) : null;
	const copyAttachments: SourceAttachment[] = (rawOriginal.attachments ?? [])
		.filter((a) => (wanted ? wanted.has(a.id) : a.disposition !== "inline"))
		.map((a) => ({
			key: `attachments/${rawOriginal.id}/${a.id}/${a.filename}`,
			filename: a.filename,
			type: a.mimetype,
			size: a.size,
			disposition: "attachment",
			contentId: null,
			move: false,
		}));

	try {
		validateSender(to, from, mailboxId);
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const result = await queueSend(c.env, stub, {
		mailboxId, from, to, cc, bcc, subject, html, text, attachments, copyAttachments,
		inReplyTo: null, references: [], threadId: null,
		draftId: draft_id ?? null, delayMs: UNDO_DELAY_MS, sendAt: parseSendAt(send_at),
	});
	if (!result.ok) return c.json({ error: result.error }, result.status);
	return c.json({ id: result.id, status: "queued", send_at: result.sendAt }, 202);
}
