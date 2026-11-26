// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useKumoToastManager } from "@cloudflare/kumo";
import { CloudArrowUpIcon, CheckIcon, PaperclipIcon, FileIcon, ImageIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { formatBytes, getAttachmentUrl, getNonInlineAttachments } from "~/lib/utils";
import { useDrive } from "~/queries/drive";
import api from "~/services/api";
import type { Attachment } from "~/types";

/** Copies one received attachment into Drive's "From email" folder. */
function SaveToDrive({ mailboxId, emailId, attachment, driveUrl }: { mailboxId: string; emailId: string; attachment: Attachment; driveUrl: string }) {
	const toast = useKumoToastManager();
	const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
	const save = async () => {
		setState("saving");
		try {
			const { item, folder } = await api.saveAttachmentToDrive(mailboxId, emailId, attachment.id);
			setState("saved");
			toast.add({
				title: `Saved to Drive in "${folder}"`,
				actions: [{ children: "Open", onClick: () => window.open(`${driveUrl}/folder/${item.parent_id ?? ""}`, "_blank", "noopener") }],
			});
		} catch (e) {
			setState("idle");
			toast.add({ title: e instanceof Error ? e.message : "Couldn't save to Drive", variant: "error" });
		}
	};
	return (
		<button
			type="button"
			onClick={save}
			disabled={state !== "idle"}
			aria-label={state === "saved" ? `${attachment.filename} saved to Drive` : `Save ${attachment.filename} to Drive`}
			title={state === "saved" ? "Saved to Drive" : "Save to Drive"}
			className="flex items-center rounded-r-md border border-l-0 border-kumo-line px-2 text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default disabled:opacity-70"
		>
			{state === "saving" ? <SpinnerGapIcon size={14} className="animate-spin" /> : state === "saved" ? <CheckIcon size={14} /> : <CloudArrowUpIcon size={14} />}
		</button>
	);
}

interface EmailAttachmentListProps {
	mailboxId?: string;
	emailId: string;
	attachments?: Attachment[];
	onPreviewImage?: (url: string, filename: string) => void;
	className?: string;
	showHeading?: boolean;
}

export default function EmailAttachmentList({
	mailboxId,
	emailId,
	attachments,
	onPreviewImage,
	className,
	showHeading = false,
}: EmailAttachmentListProps) {
	const drive = useDrive();
	if (!mailboxId) return null;

	const files = getNonInlineAttachments(attachments);
	if (files.length === 0) return null;

	return (
		<div className={className}>
			{showHeading && (
				<div className="flex items-center gap-2 mb-2">
					<PaperclipIcon size={14} className="text-kumo-subtle" />
					<span className="text-sm font-medium text-kumo-default">
						{files.length} attachment{files.length !== 1 ? "s" : ""}
					</span>
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				{files.map((attachment) => {
					const url = getAttachmentUrl(mailboxId, emailId, attachment.id);
					const isImage = attachment.mimetype?.startsWith("image/");

					if (isImage && onPreviewImage) {
						return (
							<div key={attachment.id} className="flex">
							<button
								type="button"
								onClick={() => onPreviewImage(url, attachment.filename)}
								className={`flex items-center gap-2 border border-kumo-line px-3 py-2 transition-colors hover:bg-kumo-tint text-sm text-left ${drive ? "rounded-l-md" : "rounded-md"}`}
							>
								<ImageIcon size={16} className="text-kumo-subtle shrink-0" />
								<span className="text-kumo-default font-medium truncate max-w-[140px]">
									{attachment.filename}
								</span>
								<span className="text-kumo-subtle">{formatBytes(attachment.size)}</span>
							</button>
							{drive && <SaveToDrive mailboxId={mailboxId} emailId={emailId} attachment={attachment} driveUrl={drive.url} />}
							</div>
						);
					}

					return (
						<div key={attachment.id} className="flex">
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className={`flex items-center gap-2 border border-kumo-line px-3 py-2 no-underline transition-colors hover:bg-kumo-tint text-sm ${drive ? "rounded-l-md" : "rounded-md"}`}
						>
							<FileIcon size={16} className="text-kumo-subtle shrink-0" />
							<span className="text-kumo-default font-medium truncate max-w-[140px]">
								{attachment.filename}
							</span>
							<span className="text-kumo-subtle">{formatBytes(attachment.size)}</span>
						</a>
						{drive && <SaveToDrive mailboxId={mailboxId} emailId={emailId} attachment={attachment} driveUrl={drive.url} />}
						</div>
					);
				})}
			</div>
		</div>
	);
}
