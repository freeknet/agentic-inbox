import { useCallback, useEffect, useRef, useState } from "react";
import api from "~/services/api";
import type { Attachment } from "~/types";
import { formatBytes } from "~/lib/utils";

/** Must match MAX_MESSAGE_ATTACHMENT_BYTES in workers/lib/uploads.ts. */
export const MAX_MESSAGE_ATTACHMENT_BYTES = 18 * 1024 * 1024;

export interface ComposeAttachment {
	key: string;
	filename: string;
	size: number;
	status: "uploading" | "done" | "error";
	uploadId?: string;
	error?: string;
}

/**
 * Files attached in compose. Each file is uploaded as soon as it is picked,
 * so Send only has to pass upload ids. When forwarding, the original's files
 * are listed too and can be removed.
 */
export function useComposeAttachments(mailboxId: string | undefined) {
	const [files, setFiles] = useState<ComposeAttachment[]>([]);
	const [forwarded, setForwarded] = useState<Attachment[]>([]);
	const controllers = useRef(new Map<string, AbortController>());

	const totalBytes = files.reduce((n, f) => n + (f.status === "error" ? 0 : f.size), 0) + forwarded.reduce((n, a) => n + a.size, 0);
	const isUploading = files.some((f) => f.status === "uploading");
	const hasErrors = files.some((f) => f.status === "error");

	const update = (key: string, patch: Partial<ComposeAttachment>) =>
		setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

	const addFiles = useCallback(
		(list: FileList | File[]) => {
			if (!mailboxId) return;
			let running = totalBytes;
			for (const file of Array.from(list)) {
				const key = crypto.randomUUID();
				if (running + file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
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
						update(key, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
					})
					.finally(() => controllers.current.delete(key));
			}
		},
		[mailboxId, totalBytes],
	);

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
		totalBytes,
		isUploading,
		hasErrors,
		addFiles,
		removeFile,
		removeForwarded,
		reset,
		uploadIds: files.filter((f) => f.status === "done" && f.uploadId).map((f) => f.uploadId!),
	};
}
