import { Button } from "@cloudflare/kumo";
import { PaperclipIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { type DragEvent, useRef, useState } from "react";
import type { useComposeAttachments } from "~/hooks/useComposeAttachments";
import { MAX_MESSAGE_ATTACHMENT_BYTES } from "~/hooks/useComposeAttachments";
import { formatBytes } from "~/lib/utils";

type Attachments = ReturnType<typeof useComposeAttachments>;

export function AttachButton({ attachments, disabled }: { attachments: Attachments; disabled?: boolean }) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<>
			<input
				ref={input}
				type="file"
				multiple
				hidden
				onChange={(e) => {
					if (e.target.files?.length) attachments.addFiles(e.target.files);
					e.target.value = "";
				}}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				icon={<PaperclipIcon size={14} />}
				disabled={disabled}
				onClick={() => input.current?.click()}
			>
				Attach
			</Button>
		</>
	);
}

function Chip({ name, detail, state, onRemove }: { name: string; detail: string; state?: "uploading" | "error"; onRemove: () => void }) {
	return (
		<li
			className={`flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
				state === "error" ? "border-kumo-danger text-kumo-danger" : "border-kumo-line text-kumo-default"
			}`}
		>
			{state === "uploading" && <SpinnerGapIcon size={12} className="shrink-0 animate-spin" />}
			{state === "error" && <WarningCircleIcon size={12} className="shrink-0" />}
			<span className="truncate" title={name}>{name}</span>
			<span className="shrink-0 text-kumo-subtle">{detail}</span>
			<button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="shrink-0 rounded p-0.5 hover:bg-kumo-fill">
				<XIcon size={12} />
			</button>
		</li>
	);
}

export function AttachmentChips({ attachments }: { attachments: Attachments }) {
	const { files, forwarded } = attachments;
	if (files.length === 0 && forwarded.length === 0) return null;
	return (
		<div className="space-y-1">
			<ul className="flex flex-wrap gap-1.5" aria-label="Attachments">
				{forwarded.map((a) => (
					<Chip key={a.id} name={a.filename} detail={formatBytes(a.size)} onRemove={() => attachments.removeForwarded(a.id)} />
				))}
				{files.map((f) => (
					<Chip
						key={f.key}
						name={f.filename}
						detail={f.status === "error" ? f.error || "Failed" : formatBytes(f.size)}
						state={f.status === "done" ? undefined : f.status}
						onRemove={() => attachments.removeFile(f.key)}
					/>
				))}
			</ul>
			<p className="text-xs text-kumo-subtle">
				{formatBytes(attachments.totalBytes)} of {formatBytes(MAX_MESSAGE_ATTACHMENT_BYTES, 0)}
			</p>
		</div>
	);
}

/** Lets files be dropped anywhere on the compose form. */
export function useFileDrop(attachments: Attachments) {
	const [dragging, setDragging] = useState(false);
	const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
	return {
		dragging,
		dropProps: {
			onDragOver: (e: DragEvent) => {
				if (!hasFiles(e)) return;
				e.preventDefault();
				setDragging(true);
			},
			onDragLeave: (e: DragEvent) => {
				if (e.currentTarget === e.target) setDragging(false);
			},
			onDrop: (e: DragEvent) => {
				if (!hasFiles(e)) return;
				e.preventDefault();
				setDragging(false);
				attachments.addFiles(e.dataTransfer.files);
			},
		},
	};
}
