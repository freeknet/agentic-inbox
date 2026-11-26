/**
 * Upload one file to Drive through the inbox's /api/v1/drive routes, part by
 * part (each part is its own request, under the 100 MB request cap), and get
 * a share link back. XHR is used for upload progress.
 */
import api, { type DriveItem, type DriveLink } from "~/services/api";

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void, signal: AbortSignal) {
	return new Promise<{ partNumber: number; etag: string }>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		xhr.upload.onprogress = (e) => onProgress(e.loaded);
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) return resolve(JSON.parse(xhr.responseText));
			let message = `Upload failed (${xhr.status})`;
			try {
				message = (JSON.parse(xhr.responseText) as { error?: string }).error || message;
			} catch {
				// not JSON
			}
			reject(new Error(message));
		};
		xhr.onerror = () => reject(new Error("Network error"));
		xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
		signal.addEventListener("abort", () => xhr.abort(), { once: true });
		xhr.send(blob);
	});
}

export async function uploadToDrive(
	file: File,
	onProgress: (sent: number) => void,
	signal: AbortSignal,
): Promise<{ file: DriveItem; link: DriveLink }> {
	const begin = await api.beginDriveUpload({ name: file.name, size: file.size, mime: file.type || "application/octet-stream" });
	if ("file" in begin) return begin;
	const parts: Array<{ partNumber: number; etag: string }> = [];
	try {
		for (let n = 1; n <= begin.partCount; n++) {
			const start = (n - 1) * begin.partSize;
			const blob = file.slice(start, Math.min(start + begin.partSize, file.size));
			for (let attempt = 1; ; attempt++) {
				try {
					parts.push(await putPart(`/api/v1/drive/uploads/${begin.uploadId}/parts/${n}`, blob, (l) => onProgress(start + l), signal));
					break;
				} catch (e) {
					if (signal.aborted || attempt >= 3) throw e;
					await new Promise((r) => setTimeout(r, 1000 * attempt));
				}
			}
		}
		return await api.completeDriveUpload(begin.uploadId, parts);
	} catch (e) {
		void api.abortDriveUpload(begin.uploadId).catch(() => {});
		throw e;
	}
}
