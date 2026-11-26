import AttachFileIcon from "@mui/icons-material/AttachFile";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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
				size="small"
				startIcon={<AttachFileIcon />}
				disabled={disabled}
				onClick={() => input.current?.click()}
			>
				Attach
			</Button>
		</>
	);
}

function AttachmentChip({
	name,
	detail,
	state,
	icon,
	onRemove,
}: {
	name: string;
	detail: string;
	state?: "uploading" | "error";
	icon?: ReactNode;
	onRemove: () => void;
}) {
	return (
		<Chip
			size="small"
			onDelete={onRemove}
			color={state === "error" ? "error" : "default"}
			variant={state === "error" ? "filled" : "outlined"}
			icon={
				state === "uploading" ? (
					<CircularProgress size={12} sx={{ ml: 1 }} />
				) : state === "error" ? undefined : (
					(icon as React.ReactElement)
				)
			}
			label={
				<Box component="span" sx={{ display: "inline-flex", gap: 0.75, alignItems: "baseline", minWidth: 0 }}>
					<Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
						{name}
					</Box>
					<Box component="span" sx={{ color: "text.secondary", fontSize: 11 }}>
						{detail}
					</Box>
				</Box>
			}
			sx={{ maxWidth: "100%" }}
		/>
	);
}

export function AttachmentChips({ attachments }: { attachments: Attachments }) {
	const { files, forwarded, driveLinks } = attachments;
	if (files.length === 0 && forwarded.length === 0 && driveLinks.length === 0) return null;
	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
			<Box
				component="ul"
				aria-label="Attachments"
				sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, listStyle: "none", p: 0, m: 0 }}
			>
				{forwarded.map((a) => (
					<AttachmentChip
						key={a.id}
						name={a.filename}
						detail={formatBytes(a.size)}
						onRemove={() => attachments.removeForwarded(a.id)}
					/>
				))}
				{files.map((f) => (
					<AttachmentChip
						key={f.key}
						name={f.filename}
						detail={f.status === "error" ? f.error || "Failed" : formatBytes(f.size)}
						state={f.status === "done" ? undefined : f.status}
						onRemove={() => attachments.removeFile(f.key)}
					/>
				))}
				{driveLinks.map((l) => (
					<AttachmentChip
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
						icon={<CloudOutlinedIcon sx={{ fontSize: 14, color: "primary.main" }} />}
						onRemove={() => attachments.removeDriveLink(l.key)}
					/>
				))}
			</Box>
			<Typography variant="caption" color="text.secondary">
				{formatBytes(attachments.totalBytes)} of {formatBytes(MAX_MESSAGE_ATTACHMENT_BYTES, 0)} attached
				{attachments.driveAvailable ? ". Bigger files go out as Drive links." : ""}
			</Typography>
		</Box>
	);
}

/** Add files that are already in Drive to the message, as links. */
export function FromDriveButton({ attachments, disabled }: { attachments: Attachments; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	if (!attachments.driveAvailable) return null;
	return (
		<>
			<Button
				type="button"
				size="small"
				startIcon={<CloudOutlinedIcon />}
				disabled={disabled}
				onClick={() => setOpen(true)}
			>
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
	const listing = useQuery({
		queryKey: ["drive-files", parent],
		queryFn: () => api.listDrive(parent),
		enabled: !q.trim(),
	});
	const search = useQuery({
		queryKey: ["drive-search", q.trim()],
		queryFn: () => api.searchDrive(q.trim()),
		enabled: !!q.trim(),
	});
	const items = (q.trim() ? search.data?.items : listing.data?.items) ?? [];
	const loading = q.trim() ? search.isLoading : listing.isLoading;

	return (
		<Dialog open onClose={onClose} fullWidth maxWidth="sm">
			<DialogTitle>Add from Drive</DialogTitle>
			<DialogContent>
				<TextField
					fullWidth
					size="small"
					placeholder="Search Drive"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					slotProps={{ htmlInput: { "aria-label": "Search Drive" } }}
					sx={{ mb: 1 }}
				/>
				{!q.trim() && (
					<Box
						component="nav"
						aria-label="Drive folder"
						sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5, mb: 1 }}
					>
						<Button size="small" onClick={() => setAt([])}>
							My Drive
						</Button>
						{at.map((f, i) => (
							<Box key={f.id} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
								<ChevronRightIcon sx={{ fontSize: 14, color: "text.disabled" }} />
								<Button size="small" onClick={() => setAt(at.slice(0, i + 1))}>
									{f.name}
								</Button>
							</Box>
						))}
					</Box>
				)}
				<Box sx={{ height: 288, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: 2 }}>
					{loading ? (
						<Box sx={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
							<CircularProgress />
						</Box>
					) : items.length === 0 ? (
						<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
							{q.trim() ? "No matches." : "This folder is empty."}
						</Typography>
					) : (
						<List dense disablePadding>
							{items.map((item) => (
								<ListItemButton
									key={item.id}
									onClick={() =>
										item.kind === "folder" ? setAt([...at, { id: item.id, name: item.name }]) : onPick(item)
									}
								>
									<ListItemIcon sx={{ minWidth: 36 }}>
										{item.kind === "folder" ? (
											<FolderOutlinedIcon fontSize="small" />
										) : (
											<InsertDriveFileOutlinedIcon fontSize="small" />
										)}
									</ListItemIcon>
									<ListItemText primary={item.name} slotProps={{ primary: { noWrap: true } }} />
									{item.kind === "file" ? (
										<Typography variant="caption" color="text.secondary">
											{formatBytes(item.size)}
										</Typography>
									) : (
										<ChevronRightIcon sx={{ fontSize: 16 }} />
									)}
								</ListItemButton>
							))}
						</List>
					)}
				</Box>
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
					The file goes out as a download link that works for 30 days.
				</Typography>
				<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
					<Button variant="outlined" onClick={onClose}>
						Cancel
					</Button>
				</Box>
			</DialogContent>
		</Dialog>
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
