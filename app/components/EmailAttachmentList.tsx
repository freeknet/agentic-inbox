// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArticleIcon from "@mui/icons-material/Article";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import CheckIcon from "@mui/icons-material/Check";
import AddToDriveIcon from "@mui/icons-material/AddToDrive";
import DescriptionIcon from "@mui/icons-material/Description";
import DownloadIcon from "@mui/icons-material/Download";
import FolderZipIcon from "@mui/icons-material/FolderZip";
import ImageIcon from "@mui/icons-material/Image";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import MovieIcon from "@mui/icons-material/Movie";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SlideshowIcon from "@mui/icons-material/Slideshow";
import TableChartIcon from "@mui/icons-material/TableChart";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { type ReactNode, useState } from "react";
import { formatBytes, getAttachmentUrl, getNonInlineAttachments } from "~/lib/utils";
import { useDrive } from "~/queries/drive";
import { useToast } from "~/lib/toast";
import api from "~/services/api";
import type { Attachment } from "~/types";

/** Icon and colour per file type (the same palette as Drive). */
function fileStyle(a: Attachment): { icon: typeof InsertDriveFileIcon; color: string } {
	const m = (a.mimetype ?? "").toLowerCase();
	const n = a.filename.toLowerCase();
	if (m.startsWith("image/")) return { icon: ImageIcon, color: "#d93025" };
	if (m.startsWith("video/")) return { icon: MovieIcon, color: "#d93025" };
	if (m.startsWith("audio/")) return { icon: AudioFileIcon, color: "#d93025" };
	if (m === "application/pdf" || n.endsWith(".pdf")) return { icon: PictureAsPdfIcon, color: "#ea4335" };
	if (/zip|compressed|tar|gzip|rar|7z/.test(m) || /\.(zip|rar|7z|tar|gz)$/.test(n)) return { icon: FolderZipIcon, color: "#5f6368" };
	if (/sheet|excel|csv/.test(m) || /\.(xlsx?|csv|ods)$/.test(n)) return { icon: TableChartIcon, color: "#188038" };
	if (/presentation|powerpoint/.test(m) || /\.(pptx?|odp|key)$/.test(n)) return { icon: SlideshowIcon, color: "#f9ab00" };
	if (/word|document|rtf/.test(m) || /\.(docx?|odt|rtf|pages)$/.test(n)) return { icon: ArticleIcon, color: "#1a73e8" };
	if (m.startsWith("text/")) return { icon: DescriptionIcon, color: "#1a73e8" };
	return { icon: InsertDriveFileIcon, color: "#5f6368" };
}

/** Copies one received attachment into Drive's "From email" folder. */
function SaveToDriveButton({ mailboxId, emailId, attachment, driveUrl }: { mailboxId: string; emailId: string; attachment: Attachment; driveUrl: string }) {
	const toast = useToast();
	const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
	const save = async (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		setState("saving");
		try {
			const { item, folder } = await api.saveAttachmentToDrive(mailboxId, emailId, attachment.id);
			setState("saved");
			toast.add({
				title: `Saved to Drive in "${folder}"`,
				variant: "success",
				actions: [{ children: "Open", onClick: () => void window.open(`${driveUrl}/folder/${item.parent_id ?? ""}`, "_blank", "noopener") }],
			});
		} catch (err) {
			setState("idle");
			toast.add({ title: err instanceof Error ? err.message : "Couldn't save to Drive", variant: "error" });
		}
	};
	return (
		<Tooltip title={state === "saved" ? "Saved to Drive" : "Save to Drive"}>
			<span>
				<IconButton size="small" onClick={save} disabled={state !== "idle"} aria-label={state === "saved" ? `${attachment.filename} saved to Drive` : `Save ${attachment.filename} to Drive`} sx={actionSx}>
					{state === "saving" ? <CircularProgress size={14} color="inherit" /> : state === "saved" ? <CheckIcon fontSize="small" /> : <AddToDriveIcon fontSize="small" />}
				</IconButton>
			</span>
		</Tooltip>
	);
}

const actionSx = {
	bgcolor: "rgba(32,33,36,.72)",
	color: "#fff",
	"&:hover": { bgcolor: "rgba(32,33,36,.9)" },
	"&.Mui-disabled": { color: "rgba(255,255,255,.7)" },
} as const;

interface EmailAttachmentListProps {
	mailboxId?: string;
	emailId: string;
	attachments?: Attachment[];
	onPreviewImage?: (url: string, filename: string) => void;
	sx?: SxProps<Theme>;
	showHeading?: boolean;
}

/**
 * Attachments as Gmail-style tiles: a preview (the picture itself, or the
 * file type's icon on a tint of its colour), the name and size underneath,
 * and Download / Save to Drive on hover (always shown on touch screens).
 * Pictures open in the viewer; other files open in a new tab.
 */
export default function EmailAttachmentList({ mailboxId, emailId, attachments, onPreviewImage, sx }: EmailAttachmentListProps) {
	const drive = useDrive();
	if (!mailboxId) return null;
	const files = getNonInlineAttachments(attachments);
	if (files.length === 0) return null;
	const total = files.reduce((n, f) => n + (f.size || 0), 0);

	return (
		<Box sx={sx}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
				<AttachFileIcon sx={{ fontSize: 16, color: "text.secondary", transform: "rotate(45deg)" }} />
				<Typography variant="body2" sx={{ fontWeight: 500 }}>
					{files.length} attachment{files.length !== 1 ? "s" : ""}
				</Typography>
				<Typography variant="caption" color="text.secondary">
					· {formatBytes(total)}
				</Typography>
			</Box>
			<Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 180px))", gap: 1.5 }}>
				{files.map((a) => (
					<AttachmentTile key={a.id} attachment={a} url={getAttachmentUrl(mailboxId, emailId, a.id)} onPreviewImage={onPreviewImage}>
						{drive && <SaveToDriveButton mailboxId={mailboxId} emailId={emailId} attachment={a} driveUrl={drive.url} />}
					</AttachmentTile>
				))}
			</Box>
		</Box>
	);
}

function AttachmentTile({ attachment: a, url, onPreviewImage, children }: { attachment: Attachment; url: string; onPreviewImage?: (url: string, filename: string) => void; children?: ReactNode }) {
	const { icon: Icon, color } = fileStyle(a);
	const isImage = (a.mimetype ?? "").startsWith("image/") && a.mimetype !== "image/svg+xml";
	const [imgOk, setImgOk] = useState(true);
	const open = isImage && onPreviewImage ? { onClick: () => onPreviewImage(url, a.filename) } : { component: "a" as const, href: url, target: "_blank", rel: "noopener noreferrer" };

	return (
		<Box
			sx={{
				position: "relative",
				borderRadius: 3,
				border: 1,
				borderColor: "divider",
				overflow: "hidden",
				bgcolor: "background.paper",
				transition: "box-shadow .15s, border-color .15s",
				"&:hover": { boxShadow: 3, borderColor: "transparent" },
				"&:hover .tile-actions, &:focus-within .tile-actions": { opacity: 1 },
				"@media (pointer: coarse)": { "& .tile-actions": { opacity: 1 } },
			}}
		>
			<ButtonBase {...open} aria-label={`Open ${a.filename}`} sx={{ display: "block", width: "100%", textAlign: "left", color: "inherit", textDecoration: "none" }}>
				<Box sx={{ height: 96, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: (t) => alpha(color, t.palette.mode === "dark" ? 0.16 : 0.08), overflow: "hidden" }}>
					{isImage && imgOk ? (
						<Box component="img" src={url} alt="" loading="lazy" onError={() => setImgOk(false)} sx={{ width: 1, height: 1, objectFit: "cover" }} />
					) : (
						<Icon sx={{ fontSize: 40, color }} />
					)}
				</Box>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.25, py: 1 }}>
					<Icon sx={{ fontSize: 18, color, flexShrink: 0 }} />
					<Box sx={{ minWidth: 0 }}>
						<Typography variant="body2" noWrap title={a.filename} sx={{ fontWeight: 500, lineHeight: 1.3 }}>
							{a.filename}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{formatBytes(a.size)}
						</Typography>
					</Box>
				</Box>
			</ButtonBase>
			<Box className="tile-actions" sx={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 0.5, opacity: 0, transition: "opacity .15s" }}>
				<Tooltip title="Download">
					<IconButton size="small" component="a" href={`${url}${url.includes("?") ? "&" : "?"}download=1`} download={a.filename} aria-label={`Download ${a.filename}`} sx={actionSx}>
						<DownloadIcon fontSize="small" />
					</IconButton>
				</Tooltip>
				{children}
			</Box>
		</Box>
	);
}
