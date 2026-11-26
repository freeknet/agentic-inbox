// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChatBubbleOutlinedIcon from "@mui/icons-material/ChatBubbleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import MarkEmailUnreadOutlinedIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import ReplyAllIcon from "@mui/icons-material/ReplyAll";
import ReplyIcon from "@mui/icons-material/Reply";
import ForwardIcon from "@mui/icons-material/Forward";
import SendIcon from "@mui/icons-material/Send";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import { useState } from "react";
import type { Folder, Email } from "~/types";

interface EmailPanelToolbarProps {
	email: Email;
	mailboxId?: string;
	isDraftFolder: boolean;
	isSending: boolean;
	moveToFolders: Folder[];
	lastReceivedMessage?: Email;
	onBack: () => void;
	onSendDraft: () => void;
	onEditDraft: () => void;
	onReply: () => void;
	onReplyAll: () => void;
	onForward: () => void;
	onToggleStar: () => void;
	onToggleRead: () => void;
	onMove: (folderId: string) => void;
	onViewSource: () => void;
	onDelete: () => void;
}

export default function EmailPanelToolbar({
	email,
	isDraftFolder,
	isSending,
	moveToFolders,
	onBack,
	onSendDraft,
	onEditDraft,
	onReply,
	onReplyAll,
	onForward,
	onToggleStar,
	onToggleRead,
	onMove,
	onViewSource,
	onDelete,
}: EmailPanelToolbarProps) {
	const iconButton = (title: string, icon: React.ReactNode, onClick: () => void) => (
		<Tooltip title={title}>
			<IconButton size="small" onClick={onClick} aria-label={title}>
				{icon}
			</IconButton>
		</Tooltip>
	);

	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 0.5,
				px: { xs: 1.5, md: 2 },
				py: 1,
				borderBottom: 1,
				borderColor: "divider",
				flexShrink: 0,
			}}
		>
			<IconButton
				size="small"
				onClick={onBack}
				aria-label="Back to list"
				sx={{ display: { xs: "inline-flex", md: "none" }, flexShrink: 0 }}
			>
				<ArrowBackIcon />
			</IconButton>

			{isDraftFolder ? (
				<>
					<Button
						variant="contained"
						size="small"
						startIcon={isSending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
						onClick={onSendDraft}
						disabled={isSending}
					>
						{isSending ? "Sending..." : "Send"}
					</Button>
					<Button variant="outlined" size="small" startIcon={<EditOutlinedIcon />} onClick={onEditDraft}>
						Edit
					</Button>
				</>
			) : (
				<>
					{iconButton("Reply", <ReplyIcon />, onReply)}
					{iconButton("Reply All", <ReplyAllIcon />, onReplyAll)}
					{iconButton("Forward", <ForwardIcon />, onForward)}
				</>
			)}

			<Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />

			{iconButton(
				email.starred ? "Unstar" : "Star",
				<Box component="span" sx={{ display: "flex", color: email.starred ? "warning.main" : "inherit" }}>
					{email.starred ? <StarIcon /> : <StarBorderIcon />}
				</Box>,
				onToggleStar,
			)}

			{iconButton(
				email.read ? "Mark as unread" : "Mark as read",
				email.read ? <MailOutlinedIcon /> : <MarkEmailReadOutlinedIcon />,
				onToggleRead,
			)}

			<MoveToFolderMenu folders={moveToFolders} onMove={onMove} />

			<Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.25 }}>
				{iconButton("View source", <CodeIcon />, onViewSource)}
				{iconButton("Delete", <DeleteOutlinedIcon />, onDelete)}
				<Tooltip title="Close">
					<IconButton
						size="small"
						onClick={onBack}
						aria-label="Close"
						sx={{ display: { xs: "none", md: "inline-flex" } }}
					>
						<CloseIcon />
					</IconButton>
				</Tooltip>
			</Box>
		</Box>
	);
}

function MoveToFolderMenu({ folders, onMove }: { folders: Folder[]; onMove: (id: string) => void }) {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);

	return (
		<>
			<Tooltip title="Move to folder">
				<IconButton
					size="small"
					onClick={(e) => setAnchor(e.currentTarget)}
					aria-label="Move to folder"
					aria-expanded={!!anchor}
				>
					<DriveFileMoveOutlinedIcon />
				</IconButton>
			</Tooltip>
			<Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
				<MenuItem disabled sx={{ minHeight: 32, fontSize: 12 }}>
					Move to
				</MenuItem>
				<Divider />
				{folders.map((f) => (
					<MenuItem
						key={f.id}
						onClick={() => {
							onMove(f.id);
							setAnchor(null);
						}}
					>
						<ListItemText primary={f.name} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
					</MenuItem>
				))}
			</Menu>
		</>
	);
}
