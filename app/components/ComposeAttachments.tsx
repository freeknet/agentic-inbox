import { Button, Dialog, Input, Loader } from "@cloudflare/kumo";
import { CaretRightIcon, CloudIcon, FileIcon, FolderSimpleIcon, PaperclipIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type DragEvent, type ReactNode, useRef, useState } from "react";
import type { useComposeAttachments } from "~/hooks/useComposeAttachments";
import { MAX_MESSAGE_ATTACHMENT_BYTES } from "~/hooks/useComposeAttachments";
import { formatBytes } from "~/lib/utils";
import api, { type DriveItem } from "~/services/api";

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

function Chip({
	name,
	detail,
	state,
	icon,
	onRemove,
}: { name: string; detail: string; state?: "uploading" | "error"; icon?: ReactNode; onRemove: () => void }) {
	return (
		<li
			className={`flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
				state === "error" ? "border-kumo-danger text-kumo-danger" : "border-kumo-line text-kumo-default"
			}`}
		>
			{state === "uploading" && <SpinnerGapIcon size={12} className="shrink-0 animate-spin" />}
			{state === "error" && <WarningCircleIcon size={12} className="shrink-0" />}
			{!state && icon}
			<span className="min-w-12 truncate" title={name}>{name}</span>
			<span className="shrink-0 text-kumo-subtle">{detail}</span>
			<button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="shrink-0 rounded p-0.5 hover:bg-kumo-fill">
				<XIcon size={12} />
			</button>
		</li>
	);
}

export function AttachmentChips({ attachments }: { attachments: Attachments }) {
	const { files, forwarded, driveLinks } = attachments;
	if (files.length === 0 && forwarded.length === 0 && driveLinks.length === 0) return null;
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
				{driveLinks.map((l) => (
					<Chip
						key={l.key}
						name={l.filename}
						detail={
							l.status === "error"
								? l.error || "Failed"
								: l.status === "uploading"
									? `Drive ${l.size ? Math.round((l.sent / l.size) * 100) : 0}%`
									: `Drive · ${formatBytes(l.size)}`
						}
						state={l.status === "done" ? undefined : l.status}
						icon={<CloudIcon size={12} className="shrink-0 text-kumo-brand" />}
						onRemove={() => attachments.removeDriveLink(l.key)}
					/>
				))}
			</ul>
			<p className="text-xs text-kumo-subtle">
				{formatBytes(attachments.totalBytes)} of {formatBytes(MAX_MESSAGE_ATTACHMENT_BYTES, 0)} attached
				{attachments.driveAvailable ? ". Bigger files go out as Drive links." : ""}
			</p>
		</div>
	);
}

/** Add files that are already in Drive to the message, as links. */
export function FromDriveButton({ attachments, disabled }: { attachments: Attachments; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	if (!attachments.driveAvailable) return null;
	return (
		<>
			<Button type="button" variant="ghost" size="sm" icon={<CloudIcon size={14} />} disabled={disabled} onClick={() => setOpen(true)}>
				Drive
			</Button>
			{open && (
				<DrivePicker
					onClose={() => setOpen(false)}
					onPick={(item) => {
						void attachments.addDriveItem(item);
						setOpen(false);
					}}
				/>
			)}
		</>
	);
}

function DrivePicker({ onClose, onPick }: { onClose: () => void; onPick: (item: DriveItem) => void }) {
	const [at, setAt] = useState<{ id: string; name: string }[]>([]);
	const [q, setQ] = useState("");
	const parent = at.length ? at[at.length - 1].id : null;
	const listing = useQuery({ queryKey: ["drive-files", parent], queryFn: () => api.listDrive(parent), enabled: !q.trim() });
	const search = useQuery({ queryKey: ["drive-search", q.trim()], queryFn: () => api.searchDrive(q.trim()), enabled: !!q.trim() });
	const items = (q.trim() ? search.data?.items : listing.data?.items) ?? [];
	const loading = q.trim() ? search.isLoading : listing.isLoading;

	return (
		<Dialog.Root open onOpenChange={(o) => !o && onClose()}>
			<Dialog size="base" className="p-6">
				<Dialog.Title className="mb-3 text-lg font-semibold">Add from Drive</Dialog.Title>
				<Input aria-label="Search Drive" placeholder="Search Drive" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 w-full" />
				{!q.trim() && (
					<nav className="mb-2 flex flex-wrap items-center gap-1 text-sm text-kumo-subtle" aria-label="Drive folder">
						<button type="button" className="hover:text-kumo-default" onClick={() => setAt([])}>
							My Drive
						</button>
						{at.map((f, i) => (
							<span key={f.id} className="flex items-center gap-1">
								<CaretRightIcon size={12} />
								<button type="button" className="hover:text-kumo-default" onClick={() => setAt(at.slice(0, i + 1))}>
									{f.name}
								</button>
							</span>
						))}
					</nav>
				)}
				<div className="h-72 overflow-y-auto rounded-lg border border-kumo-line">
					{loading ? (
						<div className="flex h-full items-center justify-center">
							<Loader />
						</div>
					) : items.length === 0 ? (
						<p className="p-4 text-sm text-kumo-subtle">{q.trim() ? "No matches." : "This folder is empty."}</p>
					) : (
						items.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => (item.kind === "folder" ? setAt([...at, { id: item.id, name: item.name }]) : onPick(item))}
								className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-kumo-tint"
							>
								{item.kind === "folder" ? (
									<FolderSimpleIcon size={18} weight="fill" className="shrink-0 text-kumo-subtle" />
								) : (
									<FileIcon size={18} className="shrink-0 text-kumo-subtle" />
								)}
								<span className="min-w-0 flex-1 truncate">{item.name}</span>
								{item.kind === "file" ? <span className="shrink-0 text-xs text-kumo-subtle">{formatBytes(item.size)}</span> : <CaretRightIcon size={14} />}
							</button>
						))
					)}
				</div>
				<p className="mt-2 text-xs text-kumo-subtle">The file goes out as a download link that works for 30 days.</p>
				<div className="mt-4 flex justify-end">
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
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
