// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DraftsOutlinedIcon from "@mui/icons-material/DraftsOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import InboxIcon from "@mui/icons-material/Inbox";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { type FormEvent, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Folders, SYSTEM_FOLDER_IDS } from "shared/folders";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

const FOLDER_ICONS: Record<string, React.ReactNode> = {
	[Folders.INBOX]: <InboxIcon fontSize="small" />,
	[Folders.SENT]: <SendOutlinedIcon fontSize="small" />,
	[Folders.DRAFT]: <DraftsOutlinedIcon fontSize="small" />,
	[Folders.ARCHIVE]: <ArchiveOutlinedIcon fontSize="small" />,
	[Folders.TRASH]: <DeleteOutlinedIcon fontSize="small" />,
};

const SYSTEM_FOLDER_LINKS = [
	{ id: Folders.INBOX, label: "Inbox" },
	{ id: Folders.SENT, label: "Sent" },
	{ id: Folders.DRAFT, label: "Drafts" },
	{ id: Folders.ARCHIVE, label: "Archive" },
	{ id: Folders.TRASH, label: "Trash" },
];

export default function Sidebar() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { data: folders = [] } = useFolders(mailboxId);
	const createFolderMutation = useCreateFolder();
	const { startCompose, closeSidebar } = useUIStore();
	const { data: currentMailbox } = useMailbox(mailboxId);
	const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");

	const customFolders = useMemo(
		() => folders.filter((f) => !(SYSTEM_FOLDER_IDS as readonly string[]).includes(f.id)),
		[folders],
	);

	const getUnreadCount = (folderId: string) => {
		const found = folders.find((f) => f.id === folderId);
		return found?.unreadCount || 0;
	};

	const handleCreateFolder = (e: FormEvent) => {
		e.preventDefault();
		if (newFolderName.trim() && mailboxId) {
			createFolderMutation.mutate({ mailboxId, name: newFolderName.trim() });
			setNewFolderName("");
			setIsCreateFolderOpen(false);
		}
	};

	const displayName = useMemo(() => {
		if (!currentMailbox) return mailboxId?.split("@")[0] || "Mailbox";
		// Prefer settings.fromName > name > local part of email
		if (currentMailbox.settings?.fromName) {
			return currentMailbox.settings.fromName;
		}
		if (currentMailbox.name && currentMailbox.name !== currentMailbox.email) {
			return currentMailbox.name;
		}
		return currentMailbox.email.split("@")[0] || currentMailbox.name;
	}, [currentMailbox, mailboxId]);

	const go = (folderId: string) => {
		navigate(`/mailbox/${mailboxId}/emails/${folderId}`);
		closeSidebar();
	};

	const isActive = (folderId: string) =>
		pathname === `/mailbox/${mailboxId}/emails/${folderId}`;

	const folderRow = (folderId: string, label: string, icon: React.ReactNode, unread?: number) => (
		<ListItemButton
			key={folderId}
			selected={isActive(folderId)}
			onClick={() => go(folderId)}
			sx={{ borderRadius: 999, py: 0.75, gap: 1 }}
		>
			<ListItemIcon sx={{ minWidth: 0, color: "inherit" }}>{icon}</ListItemIcon>
			<ListItemText
				primary={label}
				slotProps={{ primary: { sx: { fontSize: 14, fontWeight: isActive(folderId) ? 600 : 400 }, noWrap: true } }}
			/>
			{unread != null && unread > 0 && (
				<Chip size="small" label={unread} sx={{ height: 20, fontSize: 11 }} />
			)}
		</ListItemButton>
	);

	return (
		<Box
			component="aside"
			sx={{
				height: "100%",
				width: 256,
				bgcolor: "background.default",
				display: "flex",
				flexDirection: "column",
				flexShrink: 0,
				borderRight: 1,
				borderColor: "divider",
			}}
		>
			{/* Back + identity */}
			<Box sx={{ px: 2, pt: 2, pb: 0.5 }}>
				<Button
					size="small"
					startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
					onClick={() => {
						navigate("/");
						closeSidebar();
					}}
					sx={{ color: "text.secondary", px: 0.5, mb: 1 }}
				>
					Mailboxes
				</Button>
				<Box sx={{ px: 0.5 }}>
					<Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
						{displayName}
					</Typography>
					<Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
						{currentMailbox?.email || mailboxId}
					</Typography>
				</Box>
			</Box>

			{/* Compose */}
			<Box sx={{ px: 1.5, py: 1.5 }}>
				<Button
					variant="contained"
					fullWidth
					startIcon={<EditOutlinedIcon />}
					onClick={() => startCompose()}
				>
					Compose
				</Button>
			</Box>

			{/* Navigation */}
			<Box component="nav" sx={{ flex: 1, overflowY: "auto", px: 1 }}>
				<List dense disablePadding>
					{SYSTEM_FOLDER_LINKS.map((folder) =>
						folderRow(folder.id, folder.label, FOLDER_ICONS[folder.id], getUnreadCount(folder.id)),
					)}
				</List>

				<Box sx={{ pt: 2.5 }}>
					<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, mb: 0.5 }}>
						<Typography
							variant="caption"
							sx={{ textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: "text.secondary" }}
						>
							Folders
						</Typography>
						<Tooltip title="New folder">
							<IconButton size="small" onClick={() => setIsCreateFolderOpen(true)} aria-label="Create new folder">
								<AddIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					</Box>
					<List dense disablePadding>
						{customFolders.map((folder) =>
							folderRow(folder.id, folder.name, <FolderOutlinedIcon fontSize="small" />, folder.unreadCount),
						)}
					</List>
				</Box>
			</Box>

			{/* Create folder dialog */}
			<Dialog open={isCreateFolderOpen} onClose={() => setIsCreateFolderOpen(false)} fullWidth maxWidth="xs">
				<form onSubmit={handleCreateFolder}>
					<DialogTitle>Create folder</DialogTitle>
					<DialogContent>
						<TextField
							autoFocus
							fullWidth
							label="Folder name"
							placeholder="e.g. Projects"
							value={newFolderName}
							onChange={(e) => setNewFolderName(e.target.value)}
							required
							sx={{ mt: 1 }}
						/>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setIsCreateFolderOpen(false)}>Cancel</Button>
						<Button type="submit" variant="contained" disabled={!newFolderName.trim()}>
							Create
						</Button>
					</DialogActions>
				</form>
			</Dialog>
		</Box>
	);
}
