// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AttachFileIcon from "@mui/icons-material/AttachFile";
import CheckIcon from "@mui/icons-material/Check";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { useState } from "react";
import { formatBytes, getAttachmentUrl, getNonInlineAttachments } from "~/lib/utils";
import { useDrive } from "~/queries/drive";
import { useToast } from "~/lib/toast";
import api from "~/services/api";
import type { Attachment } from "~/types";

/** Copies one received attachment into Drive's "From email" folder. */
function SaveToDrive({
	mailboxId,
	emailId,
	attachment,
	driveUrl,
}: {
	mailboxId: string;
	emailId: string;
	attachment: Attachment;
	driveUrl: string;
}) {
	const toast = useToast();
	const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
	const save = async () => {
		setState("saving");
		try {
			const { item, folder } = await api.saveAttachmentToDrive(mailboxId, emailId, attachment.id);
			setState("saved");
			toast.add({
				title: `Saved to Drive in "${folder}"`,
				actions: [
					{
						children: "Open",
						onClick: () => {
							window.open(`${driveUrl}/folder/${item.parent_id ?? ""}`, "_blank", "noopener");
						},
					},
				],
			});
		} catch (e) {
			setState("idle");
			toast.add({ title: e instanceof Error ? e.message : "Couldn't save to Drive", variant: "error" });
		}
	};
	return (
		<Tooltip title={state === "saved" ? "Saved to Drive" : "Save to Drive"}>
			<span>
				<IconButton
					size="small"
					onClick={save}
					disabled={state !== "idle"}
					aria-label={
						state === "saved"
							? `${attachment.filename} saved to Drive`
							: `Save ${attachment.filename} to Drive`
					}
					sx={{ border: 1, borderLeft: 0, borderColor: "divider", borderRadius: "0 8px 8px 0" }}
				>
					{state === "saving" ? (
						<CircularProgress size={14} />
					) : state === "saved" ? (
						<CheckIcon fontSize="small" />
					) : (
						<CloudUploadOutlinedIcon fontSize="small" />
					)}
				</IconButton>
			</span>
		</Tooltip>
	);
}

interface EmailAttachmentListProps {
	mailboxId?: string;
	emailId: string;
	attachments?: Attachment[];
	onPreviewImage?: (url: string, filename: string) => void;
	sx?: SxProps<Theme>;
	showHeading?: boolean;
}

export default function EmailAttachmentList({
	mailboxId,
	emailId,
	attachments,
	onPreviewImage,
	sx,
	showHeading = false,
}: EmailAttachmentListProps) {
	const drive = useDrive();
	if (!mailboxId) return null;

	const files = getNonInlineAttachments(attachments);
	if (files.length === 0) return null;

	return (
		<Box sx={sx}>
			{showHeading && (
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
					<AttachFileIcon sx={{ fontSize: 16, color: "text.secondary" }} />
					<Typography variant="body2" sx={{ fontWeight: 500 }}>
						{files.length} attachment{files.length !== 1 ? "s" : ""}
					</Typography>
				</Box>
			)}
			<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
				{files.map((attachment) => {
					const url = getAttachmentUrl(mailboxId, emailId, attachment.id);
					const isImage = attachment.mimetype?.startsWith("image/");
					const chipSx = {
						display: "flex",
						alignItems: "center",
						gap: 1,
						border: 1,
						borderColor: "divider",
						px: 1.5,
						py: 0.75,
						borderRadius: drive ? "8px 0 0 8px" : "8px",
						textAlign: "left",
						justifyContent: "flex-start",
						maxWidth: 320,
					} as const;

					const inner = (
						<>
							{isImage ? (
								<ImageOutlinedIcon sx={{ fontSize: 18, color: "text.secondary", flexShrink: 0 }} />
							) : (
								<InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: "text.secondary", flexShrink: 0 }} />
							)}
							<Typography
								variant="body2"
								sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
							>
								{attachment.filename}
							</Typography>
							<Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
								{formatBytes(attachment.size)}
							</Typography>
						</>
					);

					return (
						<Box key={attachment.id} sx={{ display: "flex" }}>
							{isImage && onPreviewImage ? (
								<ButtonBase
									onClick={() => onPreviewImage(url, attachment.filename)}
									sx={{ ...chipSx, "&:hover": { bgcolor: "action.hover" } }}
								>
									{inner}
								</ButtonBase>
							) : (
								<ButtonBase
									component="a"
									href={url}
									target="_blank"
									rel="noopener noreferrer"
									sx={{ ...chipSx, textDecoration: "none", color: "inherit", "&:hover": { bgcolor: "action.hover" } }}
								>
									{inner}
								</ButtonBase>
							)}
							{drive && (
								<SaveToDrive mailboxId={mailboxId} emailId={emailId} attachment={attachment} driveUrl={drive.url} />
							)}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
