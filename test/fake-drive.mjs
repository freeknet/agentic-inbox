// A stand-in for agentic-drive's DriveService (agentic-drive/workers/service.ts)
// for the inbox tests. It keeps files in memory and checks part lengths the
// same way the real one does. State lives for the test run (module scope).
import { WorkerEntrypoint } from "cloudflare:workers";

const PART = 5;
const files = new Map();
const uploads = new Map();
const folders = new Map();
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function folderId(path = []) {
	const key = path.join("/");
	if (!key) return null;
	if (!folders.has(key)) folders.set(key, id());
	return folders.get(key);
}

function item(f) {
	return { id: f.id, parent_id: f.parent_id, kind: "file", name: f.name, size: f.size, mime: f.mime, created_at: 0, updated_at: 0 };
}

async function read(stream) {
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class DriveService extends WorkerEntrypoint {
	async info() {
		let bytes = 0;
		for (const f of files.values()) bytes += f.size;
		return { url: "https://drive.example.com", bytes, files: files.size, trashBytes: 0, limit: 10 * 1024 ** 3 };
	}
	async list(parentId) {
		return { breadcrumbs: [], items: [...files.values()].filter((f) => f.parent_id === parentId).map(item) };
	}
	async search(q) {
		return [...files.values()].filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).map(item);
	}
	async getItem(itemId) {
		const f = files.get(itemId);
		return f ? item(f) : null;
	}
	async saveFile({ name, size, mime, body, folder }) {
		const bytes = await read(body);
		if (bytes.byteLength !== size) throw new Error("[400] Size mismatch");
		const f = { id: id(), parent_id: folderId(folder), name, size, mime: mime ?? "application/octet-stream", bytes };
		files.set(f.id, f);
		return item(f);
	}
	async beginUpload({ name, size, mime, folder }) {
		if (size === 0) {
			const f = { id: id(), parent_id: folderId(folder), name, size, mime, bytes: new Uint8Array(0) };
			files.set(f.id, f);
			return { file: item(f) };
		}
		const u = { id: id(), parent_id: folderId(folder), name, size, mime, parts: new Map() };
		uploads.set(u.id, u);
		return { uploadId: u.id, partSize: PART, partCount: Math.ceil(size / PART) };
	}
	async uploadPart(uploadId, partNumber, body, length) {
		const u = uploads.get(uploadId);
		if (!u) throw new Error("[404] Upload not found");
		const count = Math.ceil(u.size / PART);
		const expected = partNumber < count ? PART : u.size - PART * (count - 1);
		if (partNumber < 1 || partNumber > count || length !== expected) throw new Error(`[400] Part ${partNumber} must be ${expected} bytes`);
		u.parts.set(partNumber, await read(body));
		return { partNumber, etag: `etag-${partNumber}` };
	}
	async completeUpload(uploadId, parts) {
		const u = uploads.get(uploadId);
		if (!u) throw new Error("[404] Upload not found");
		if (parts.length !== u.parts.size) throw new Error("[400] Some parts are missing");
		const bytes = new Uint8Array(u.size);
		let off = 0;
		for (let p = 1; p <= u.parts.size; p++) {
			bytes.set(u.parts.get(p), off);
			off += u.parts.get(p).byteLength;
		}
		uploads.delete(uploadId);
		const f = { id: u.id, parent_id: u.parent_id, name: u.name, size: u.size, mime: u.mime, bytes };
		files.set(f.id, f);
		return item(f);
	}
	async abortUpload(uploadId) {
		uploads.delete(uploadId);
	}
	async createShareLink(itemId, days) {
		if (!files.has(itemId)) throw new Error("[404] Not found");
		const token = `tok_${itemId.slice(-6)}_aaaaaaaaaaaaaaaa`;
		return { url: `https://drive.example.com/s/${token}`, token, expiresAt: days === null ? null : Date.now() + (days ?? 30) * 86_400_000 };
	}
	/** Test helper: the bytes stored for a file. */
	async bytesOf(itemId) {
		return files.get(itemId)?.bytes ?? null;
	}
}

export default {
	fetch() {
		return new Response("fake drive");
	},
};
