/**
 * Drive integration routes. The browser never talks to the Drive Worker
 * directly (it has its own Access app and origin); these routes forward to it
 * over the service binding, streaming upload parts straight through.
 */
import type { Context, Hono } from "hono";
import { z } from "zod";
import { driveError, getDrive, SAVED_FOLDER, SENT_FOLDER, SENT_LINK_DAYS, type DriveRpc } from "../lib/drive";
import type { MailboxContext } from "../lib/mailbox";

type AppContext = Context<MailboxContext>;

async function withDrive(c: AppContext, fn: (drive: DriveRpc) => Promise<Response>): Promise<Response> {
	const drive = getDrive(c.env);
	if (!drive) return c.json({ error: "Drive isn't connected" }, 404);
	try {
		return await fn(drive);
	} catch (e) {
		if (e instanceof z.ZodError) return c.json({ error: e.issues[0]?.message ?? "Invalid request" }, 400);
		const { status, message } = driveError(e);
		if (status === 502) console.error("Drive call failed:", (e as Error).message);
		return c.json({ error: message }, status);
	}
}

const uuid = z.uuid();
const PartsBody = z.object({ parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string() })).min(1) });
const BeginBody = z.object({ name: z.string().min(1).max(255), size: z.number().int().nonnegative(), mime: z.string().max(255).optional() });
const LinkBody = z.object({ days: z.number().int().min(1).max(365).nullable().optional() });

export function registerDriveRoutes(app: Hono<MailboxContext>) {
	/** Whether Drive is connected, and its storage use. Never fails: the UI hides Drive features when `available` is false. */
	app.get("/api/v1/drive", async (c: AppContext) => {
		const drive = getDrive(c.env);
		if (!drive) return c.json({ available: false });
		try {
			return c.json({ available: true, ...(await drive.info()) });
		} catch (e) {
			console.error("Drive info failed:", (e as Error).message);
			return c.json({ available: false });
		}
	});

	app.get("/api/v1/drive/files", (c: AppContext) =>
		withDrive(c, async (drive) => {
			const parent = c.req.query("parent");
			return c.json(await drive.list(parent ? uuid.parse(parent) : null));
		}),
	);

	app.get("/api/v1/drive/search", (c: AppContext) => withDrive(c, async (drive) => c.json({ items: await drive.search(c.req.query("q") ?? "") })));

	/** A public download link for a Drive file, to put in an email. */
	app.post("/api/v1/drive/files/:id/link", (c: AppContext) =>
		withDrive(c, async (drive) => {
			const body = LinkBody.parse(await c.req.json().catch(() => ({})));
			return c.json(await drive.createShareLink(uuid.parse(c.req.param("id")), body.days ?? SENT_LINK_DAYS), 201);
		}),
	);

	// Large files from compose: a multipart upload into Drive, then a share link.
	app.post("/api/v1/drive/uploads", (c: AppContext) =>
		withDrive(c, async (drive) => {
			const b = BeginBody.parse(await c.req.json().catch(() => undefined));
			const r = await drive.beginUpload({ ...b, folder: SENT_FOLDER, source: "email" });
			if ("file" in r) return c.json({ file: r.file, link: await drive.createShareLink(r.file.id, SENT_LINK_DAYS) }, 201);
			return c.json(r, 201);
		}),
	);

	app.put("/api/v1/drive/uploads/:id/parts/:n", (c: AppContext) =>
		withDrive(c, async (drive) => {
			const length = Number(c.req.header("content-length"));
			const body = c.req.raw.body;
			if (!Number.isFinite(length) || !body) return c.json({ error: "Content-Length is required" }, 411);
			return c.json(await drive.uploadPart(uuid.parse(c.req.param("id")), Number(c.req.param("n")), body, length));
		}),
	);

	app.post("/api/v1/drive/uploads/:id/complete", (c: AppContext) =>
		withDrive(c, async (drive) => {
			const { parts } = PartsBody.parse(await c.req.json().catch(() => undefined));
			const file = await drive.completeUpload(uuid.parse(c.req.param("id")), parts, "email");
			return c.json({ file, link: await drive.createShareLink(file.id, SENT_LINK_DAYS) }, 201);
		}),
	);

	app.delete("/api/v1/drive/uploads/:id", (c: AppContext) =>
		withDrive(c, async (drive) => {
			await drive.abortUpload(uuid.parse(c.req.param("id")));
			return c.body(null, 204);
		}),
	);

	/** Copy a received attachment into Drive's "From email" folder. */
	app.post("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId/save-to-drive", (c: AppContext) =>
		withDrive(c, async (drive) => {
			const emailId = c.req.param("emailId")!;
			const attachmentId = c.req.param("attachmentId")!;
			const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
			if (!attachment || attachment.email_id !== emailId) return c.json({ error: "Attachment not found" }, 404);
			const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
			if (!obj) return c.json({ error: "Attachment file not found" }, 404);
			const item = await drive.saveFile({
				name: attachment.filename,
				size: obj.size,
				mime: attachment.mimetype,
				body: obj.body,
				folder: SAVED_FOLDER,
				source: "email",
			});
			return c.json({ item, folder: SAVED_FOLDER.join("/") }, 201);
		}),
	);
}
