// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DraftsOutlinedIcon from "@mui/icons-material/DraftsOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { type FormEvent, useMemo, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router";
import { Folders, SYSTEM_FOLDER_IDS } from "shared/folders";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";
import { useToast } from "~/lib/toast";
import { SidebarFooter, SidebarFrame, SidebarItem, SidebarPrimaryButton, SidebarSection } from "~/shell/Sidebar";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { rainbowFor } from "~/theme";

const FOLDER_ICONS: Record<string, React.ReactNode> = {
	[Folders.INBOX]: <InboxOutlinedIcon />,
	[Folders.SENT]: <SendOutlinedIcon />,
	[Folders.DRAFT]: <DraftsOutlinedIcon />,
	[Folders.ARCHIVE]: <ArchiveOutlinedIcon />,
	[Folders.TRASH]: <DeleteOutlinedIcon />,
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
	const { startCompose, closeSidebar, isSidebarOpen } = useUIStore();
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

	const toast = useToast();

	const handleCreateFolder = async (e: FormEvent) => {
		e.preventDefault();
		const name = newFolderName.trim();
		if (!name || !mailboxId) return;
		try {
			await createFolderMutation.mutateAsync({ mailboxId, name });
			toast.add({ title: `Folder "${name}" created`, variant: "success" });
			setNewFolderName("");
			setIsCreateFolderOpen(false);
		} catch (err) {
			toast.add({ title: err instanceof Error ? err.message : "Could not create folder", variant: "error" });
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

	// Each folder has its own rainbow colour: system folders fixed, yours by id.
	const FOLDER_COLORS: Record<string, string> = { inbox: "#4285f4", sent: "#34a853", draft: "#fa7b17", archive: "#a142f4", trash: "#ea4335", spam: "#fbbc04" };
	const folderRow = (folderId: string, label: string, icon: React.ReactNode, unread?: number) => (
		<SidebarItem key={folderId} icon={icon} label={label} color={FOLDER_COLORS[folderId] ?? rainbowFor(folderId)} selected={isActive(folderId)} onClick={() => go(folderId)} count={unread} />
	);

	return (
		<SidebarFrame open={isSidebarOpen} onClose={closeSidebar}>
			<SidebarPrimaryButton
				icon={<EditOutlinedIcon />}
				label="Compose"
				onClick={() => {
					// The compose pane lives in the list views; from elsewhere (Settings), open it over the inbox.
					if (!pathname.includes("/emails/") && !pathname.includes("/search")) navigate(`/mailbox/${mailboxId}/emails/inbox`);
					startCompose();
					closeSidebar();
				}}
			/>

			<Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
				<List aria-label="Mail folders" disablePadding>
					{SYSTEM_FOLDER_LINKS.map((folder) =>
						folderRow(folder.id, folder.label, FOLDER_ICONS[folder.id], getUnreadCount(folder.id)),
					)}
				</List>
				<SidebarSection
					title="Folders"
					action={
						<Tooltip title="New folder">
							<IconButton size="small" onClick={() => setIsCreateFolderOpen(true)} aria-label="Create new folder">
								<AddIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					}
				/>
				<List aria-label="Your folders" disablePadding>
					{customFolders.map((folder) => folderRow(folder.id, folder.name, <FolderOutlinedIcon />, folder.unreadCount))}
				</List>
				<List aria-label="More" disablePadding sx={{ mt: 1 }}>
					<SidebarItem
						icon={<SettingsOutlinedIcon />}
						color="#24c1e0"
						label="Settings"
						selected={pathname.endsWith("/settings")}
						onClick={() => {
							closeSidebar();
							navigate(`/mailbox/${mailboxId}/settings`);
						}}
					/>
				</List>
			</Box>

			{/* Which mailbox this is, where Drive shows its storage meter. */}
			<SidebarFooter>
				<Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
					{displayName}
				</Typography>
				<Typography variant="caption" sx={{ color: "text.secondary", display: "block" }} noWrap>
					{currentMailbox?.email || mailboxId}
				</Typography>
				<Link component={RouterLink} to="/" underline="hover" variant="caption" onClick={closeSidebar} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
					<SwapHorizIcon sx={{ fontSize: 14 }} /> Switch mailbox
				</Link>
			</SidebarFooter>

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
		</SidebarFrame>
	);
}
