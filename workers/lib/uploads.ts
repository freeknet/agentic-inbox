/**
 * Outgoing attachments are uploaded one file at a time with a raw PUT that
 * the Worker streams straight into R2 (plan §A5). No base64 decoding runs in
 * the Worker, which only has 10 ms of CPU on Free. The send request then
 * refers to the upload by id.
 */
import type { Env } from "../types";

/**
 * Total attachment size per outgoing message. Resend accepts 40 MB after
 * base64, but Gmail and Outlook reject messages over about 25 MB including
 * the base64 overhead, which leaves about 18 MiB of raw attachments.
 */
export const MAX_MESSAGE_ATTACHMENT_BYTES = 18 * 1024 * 1024;
/** Uploads not used by a send within a day are expired by an R2 lifecycle rule on this prefix. */
export const UPLOAD_PREFIX = "uploads/";

const UPLOAD_ID = /^[0-9a-f-]{36}$/;

export function safeFilename(name: string | null | undefined): string {
	const cleaned = (name || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_").slice(0, 200);
	return cleaned || "untitled";
}

export function uploadKey(mailboxId: string, uploadId: string): string | null {
	if (!UPLOAD_ID.test(uploadId)) return null;
	return `${UPLOAD_PREFIX}${encodeURIComponent(mailboxId)}/${uploadId}`;
}

export type UploadResult =
	| { ok: true; upload: { upload_id: string; filename: string; type: string; size: number } }
	| { ok: false; status: 400 | 411 | 413; error: string };

/** Stream a request body into R2. The request must carry Content-Length. */
export async function storeUpload(env: Env, mailboxId: string, request: Request): Promise<UploadResult> {
	const lengthHeader = request.headers.get("Content-Length");
	if (lengthHeader === null || !/^\d+$/.test(lengthHeader)) {
		return { ok: false, status: 411, error: "Content-Length is required" };
	}
	const size = Number(lengthHeader);
	if (size === 0 || !request.body) return { ok: false, status: 400, error: "Empty upload" };
	if (size > MAX_MESSAGE_ATTACHMENT_BYTES) {
		return { ok: false, status: 413, error: `Attachments are limited to ${MAX_MESSAGE_ATTACHMENT_BYTES / 1024 / 1024} MB per message` };
	}

	const url = new URL(request.url);
	const filename = safeFilename(url.searchParams.get("filename"));
	const type = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim().slice(0, 100);
	const uploadId = crypto.randomUUID();
	const key = uploadKey(mailboxId, uploadId)!;

	// R2 only accepts a stream whose length is known up front.
	const fixed = new FixedLengthStream(size);
	const [, obj] = await Promise.all([
		request.body.pipeTo(fixed.writable),
		env.BUCKET.put(key, fixed.readable, {
			httpMetadata: { contentType: type },
			customMetadata: { filename },
		}),
	]);
	if (!obj) return { ok: false, status: 400, error: "Upload failed" };
	return { ok: true, upload: { upload_id: uploadId, filename, type, size } };
}

export async function deleteUpload(env: Env, mailboxId: string, uploadId: string): Promise<boolean> {
	const key = uploadKey(mailboxId, uploadId);
	if (!key) return false;
	await env.BUCKET.delete(key);
	return true;
}

/** Copy an R2 object by streaming it; this is I/O, not Worker CPU. */
export async function copyObject(bucket: R2Bucket, from: string, to: string): Promise<R2Object | null> {
	const src = await bucket.get(from);
	if (!src) return null;
	return bucket.put(to, src.body.pipeThrough(new FixedLengthStream(src.size)), {
		httpMetadata: src.httpMetadata,
	});
}
