import { useCallback, useEffect, useRef, useState } from "react";
import { uploadToDrive } from "~/lib/driveUpload";
import { useToast } from "~/lib/toast";
import { escapeHtml, formatBytes } from "~/lib/utils";
import api, { ApiError, type DriveItem } from "~/services/api";
import type { Attachment } from "~/types";

/** Must match MAX_MESSAGE_ATTACHMENT_BYTES in workers/lib/uploads.ts. */
export const MAX_MESSAGE_ATTACHMENT_BYTES = 18 * 1024 * 1024;
/** Must match MAX_FILE_BYTES in agentic-drive/shared/limits.ts. */
export const MAX_DRIVE_FILE_BYTES = 5 * 1024 * 1024 * 1024;

export interface ComposeAttachment {
	key: string;
	filename: string;
	size: number;
	status: "uploading" | "done" | "error";
	uploadId?: string;
	error?: string;
}

/** A file sent as a Drive share link instead of an attachment. */
export interface DriveLinkAttachment {
	key: string;
	filename: string;
	size: number;
	status: "uploading" | "done" | "error";
	sent: number;
	url?: string;
	expiresAt?: number | null;
	error?: string;
}

const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Upload failed");

function expiryText(expiresAt: number | null | undefined): string {
	if (!expiresAt) return "";
	return ` (link expires ${new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })})`;
}

/** The block of Drive links appended to an outgoing message. */
export function driveLinksHtml(links: DriveLinkAttachment[]): string {
	const done = links.filter((l) => l.status === "done" && l.url);
	if (!done.length) return "";
	const rows = done
		.map(
			(l) =>
				`<div style="margin:4px 0"><a href="${escapeHtml(l.url!)}">${escapeHtml(l.filename)}</a> <span style="color:#777">${formatBytes(l.size)}${escapeHtml(expiryText(l.expiresAt))}</span></div>`,
		)
		.join("");
	return `<div style="margin-top:16px;padding:10px 12px;border:1px solid #ddd;border-radius:8px"><div style="font-weight:600;margin-bottom:4px">Files shared from Drive</div>${rows}</div>`;
}

export function driveLinksText(links: DriveLinkAttachment[]): string {
	const done = links.filter((l) => l.status === "done" && l.url);
	if (!done.length) return "";
	return `\n\nFiles shared from Drive:\n${done.map((l) => `${l.filename}, ${formatBytes(l.size)}${expiryText(l.expiresAt)}: ${l.url}`).join("\n")}`;
}

/**
 * Files attached in compose. Each file is uploaded as soon as it is picked,
 * so Send only has to pass upload ids. When forwarding, the original's files
 * are listed too and can be removed. With Drive connected, a file that would
 * take the message over the attachment limit goes to Drive and is sent as a
 * link, and Drive files can be added as links.
 */
export function useComposeAttachments(mailboxId: string | undefined, driveAvailable = false) {
	const toast = useToast();
	const [files, setFiles] = useState<ComposeAttachment[]>([]);
	const [forwarded, setForwarded] = useState<Attachment[]>([]);
	const [driveLinks, setDriveLinks] = useState<DriveLinkAttachment[]>([]);
	const controllers = useRef(new Map<string, AbortController>());

	const totalBytes = files.reduce((n, f) => n + (f.status === "error" ? 0 : f.size), 0) + forwarded.reduce((n, a) => n + a.size, 0);
	const isUploading = files.some((f) => f.status === "uploading") || driveLinks.some((l) => l.status === "uploading");
	const hasErrors = files.some((f) => f.status === "error") || driveLinks.some((l) => l.status === "error");

	const update = (key: string, patch: Partial<ComposeAttachment>) =>
		setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
	const updateLink = (key: string, patch: Partial<DriveLinkAttachment>) =>
		setDriveLinks((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

	const sendViaDrive = useCallback((file: File) => {
		const key = crypto.randomUUID();
		if (file.size > MAX_DRIVE_FILE_BYTES) {
			setDriveLinks((prev) => [...prev, { key, filename: file.name, size: file.size, status: "error", sent: 0, error: "Over 5 GB" }]);
			return;
		}
		const controller = new AbortController();
		controllers.current.set(key, controller);
		setDriveLinks((prev) => [...prev, { key, filename: file.name, size: file.size, status: "uploading", sent: 0 }]);
		uploadToDrive(file, (sent) => updateLink(key, { sent }), controller.signal)
			.then(({ link }) => updateLink(key, { status: "done", sent: file.size, url: link.url, expiresAt: link.expiresAt }))
			.catch((e: unknown) => {
				if (controller.signal.aborted) return;
				updateLink(key, { status: "error", error: message(e) });
				toast.add({ title: `${file.name} could not go to Drive: ${message(e)}`, variant: "error" });
			})
			.finally(() => controllers.current.delete(key));
	}, []);

	const addFiles = useCallback(
		(list: FileList | File[]) => {
			if (!mailboxId) return;
			let running = totalBytes;
			for (const file of Array.from(list)) {
				const key = crypto.randomUUID();
				if (running + file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
					if (driveAvailable) {
						sendViaDrive(file);
						continue;
					}
					setFiles((prev) => [
						...prev,
						{ key, filename: file.name, size: file.size, status: "error", error: `Over the ${formatBytes(MAX_MESSAGE_ATTACHMENT_BYTES, 0)} limit` },
					]);
					continue;
				}
				running += file.size;
				const controller = new AbortController();
				controllers.current.set(key, controller);
				setFiles((prev) => [...prev, { key, filename: file.name, size: file.size, status: "uploading" }]);
				api
					.uploadFile(mailboxId, file, controller.signal)
					.then((up) => update(key, { status: "done", uploadId: up.upload_id }))
					.catch((err: unknown) => {
						if (controller.signal.aborted) return;
						const reason = err instanceof Error ? err.message : "Upload failed";
						update(key, { status: "error", error: reason });
						toast.add({ title: `${file.name} failed to attach: ${reason}`, variant: "error" });
					})
					.finally(() => controllers.current.delete(key));
			}
		},
		[mailboxId, totalBytes, driveAvailable, sendViaDrive],
	);

	/** Add a file that is already in Drive, as a share link. */
	const addDriveItem = useCallback(async (item: DriveItem) => {
		const key = crypto.randomUUID();
		setDriveLinks((prev) => [...prev, { key, filename: item.name, size: item.size, status: "uploading", sent: item.size }]);
		try {
			const link = await api.driveLink(item.id);
			updateLink(key, { status: "done", url: link.url, expiresAt: link.expiresAt });
		} catch (e) {
			updateLink(key, { status: "error", error: message(e) });
		}
	}, []);

	const removeFile = useCallback(
		(key: string) => {
			controllers.current.get(key)?.abort();
			setFiles((prev) => {
				const f = prev.find((x) => x.key === key);
				if (f?.uploadId && mailboxId) void api.deleteUpload(mailboxId, f.uploadId).catch(() => {});
				return prev.filter((x) => x.key !== key);
			});
		},
		[mailboxId],
	);

	/** Drop a Drive link from the message. The file stays in Drive. */
	const removeDriveLink = useCallback((key: string) => {
		controllers.current.get(key)?.abort();
		setDriveLinks((prev) => prev.filter((l) => l.key !== key));
	}, []);

	const removeForwarded = useCallback((id: string) => setForwarded((prev) => prev.filter((a) => a.id !== id)), []);

	/** Start over. Pass `discard` to delete uploads that were never sent. */
	const reset = useCallback(
		(opts: { forwarded?: Attachment[]; discard?: boolean } = {}) => {
			for (const c of controllers.current.values()) c.abort();
			controllers.current.clear();
			setFiles((prev) => {
				if (opts.discard && mailboxId) {
					for (const f of prev) if (f.uploadId) void api.deleteUpload(mailboxId, f.uploadId).catch(() => {});
				}
				return [];
			});
			setDriveLinks([]);
			setForwarded(opts.forwarded ?? []);
		},
		[mailboxId],
	);

	useEffect(() => () => {
		for (const c of controllers.current.values()) c.abort();
	}, []);

	return {
		files,
		forwarded,
		driveLinks,
		driveAvailable,
		totalBytes,
		isUploading,
		hasErrors,
		addFiles,
		addDriveItem,
		removeFile,
		removeDriveLink,
		removeForwarded,
		reset,
		uploadIds: files.filter((f) => f.status === "done" && f.uploadId).map((f) => f.uploadId!),
	};
}
