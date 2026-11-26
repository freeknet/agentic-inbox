/**
 * The agentic-drive Worker, reached over a service binding (`DRIVE`, entrypoint
 * `DriveService`). Optional: without the binding every Drive feature is off.
 * The RPC surface is declared here because the Drive Worker lives in another
 * repository; keep it in step with agentic-drive/workers/service.ts.
 */
import type { Env } from "../types";

export interface DriveItem {
	id: string;
	parent_id: string | null;
	kind: "file" | "folder";
	name: string;
	size: number;
	mime: string | null;
	created_at: number;
	updated_at: number;
}

export interface DriveLink {
	url: string;
	token: string;
	expiresAt: number | null;
}

export interface DriveRpc {
	info(): Promise<{ url: string; bytes: number; files: number; trashBytes: number; limit: number }>;
	list(parentId: string | null): Promise<{ breadcrumbs: Array<{ id: string; name: string }>; items: DriveItem[] }>;
	search(query: string): Promise<DriveItem[]>;
	getItem(id: string): Promise<DriveItem | null>;
	saveFile(f: { name: string; size: number; mime?: string; body: ReadableStream<Uint8Array>; folder?: string[]; source?: string }): Promise<DriveItem>;
	beginUpload(b: { name: string; size: number; mime?: string; folder?: string[]; source?: string }): Promise<
		{ uploadId: string; partSize: number; partCount: number } | { file: DriveItem }
	>;
	uploadPart(uploadId: string, partNumber: number, body: ReadableStream<Uint8Array>, length: number): Promise<{ partNumber: number; etag: string }>;
	completeUpload(uploadId: string, parts: Array<{ partNumber: number; etag: string }>, source?: string): Promise<DriveItem>;
	abortUpload(uploadId: string): Promise<void>;
	createShareLink(itemId: string, days?: number | null): Promise<DriveLink>;
}

export function getDrive(env: Env): DriveRpc | null {
	const binding = (env as unknown as { DRIVE?: unknown }).DRIVE;
	return binding ? (binding as DriveRpc) : null;
}

/** Folder in Drive for attachments saved from received mail. */
export const SAVED_FOLDER = ["From email"];
/** Folder in Drive for large files sent as links. */
export const SENT_FOLDER = ["Sent as links"];
/** How long a link for a file sent by email stays valid. */
export const SENT_LINK_DAYS = 30;

/**
 * Drive errors cross RPC as plain Errors whose message starts with the HTTP
 * status, e.g. "[404] Not found" (see agentic-drive/workers/drive-do.ts).
 */
export function driveError(e: unknown): { status: 400 | 404 | 409 | 413 | 502; message: string } {
	const m = /^\[(400|404|409|413)\] ([\s\S]*)$/.exec(e instanceof Error ? e.message : String(e));
	if (m) return { status: Number(m[1]) as 400 | 404 | 409 | 413, message: m[2] };
	return { status: 502, message: "Drive is unavailable" };
}
