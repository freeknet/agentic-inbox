// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DraftsOutlinedIcon from "@mui/icons-material/DraftsOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import InboxIcon from "@mui/icons-material/Inbox";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import MarkEmailUnreadOutlinedIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import ReplyIcon from "@mui/icons-material/Reply";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Pagination from "@mui/material/Pagination";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { DeliveryBadge } from "~/components/DeliveryBadge";
import { getSnippetText } from "~/lib/utils";
import { confirmDialog } from "~/lib/confirm";
import { rowPadding, usePrefs } from "~/lib/prefs";
import { useToast } from "~/lib/toast";
import api from "~/services/api";
import { useDeleteEmail, useEmails, useMarkThreadRead, useUpdateEmail } from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";

const FOLDER_EMPTY_STATES: Record<
	string,
	{
		icon: React.ReactNode;
		title: string;
		description: string;
		showCompose?: boolean;
	}
> = {
	[Folders.INBOX]: {
		icon: <InboxIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
		title: "Your inbox is empty",
		description:
			"New emails will appear here when they arrive. Send an email to get the conversation started.",
		showCompose: true,
	},
	[Folders.SENT]: {
		icon: <SendOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
		title: "No sent emails",
		description: "Emails you send will show up here.",
		showCompose: true,
	},
	[Folders.DRAFT]: {
		icon: <DraftsOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
		title: "No drafts",
		description: "Emails you're still working on will be saved here.",
		showCompose: true,
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
		title: "Archive is empty",
		description: "Move emails here to keep your inbox clean without deleting them.",
	},
	[Folders.TRASH]: {
		icon: <DeleteOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
		title: "Trash is empty",
		description: "Deleted emails will appear here. You can restore them or permanently delete them.",
	},
};

function EmailListSkeleton() {
	return (
		<Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 1 }}>
			{Array.from({ length: 8 }).map((_, i) => (
				<Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1.5 }}>
					<Skeleton variant="circular" width={18} height={18} />
					<Skeleton variant="circular" width={16} height={16} />
					<Box sx={{ flex: 1 }}>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<Skeleton variant="text" width={96} />
							<Skeleton variant="text" sx={{ flex: 1 }} />
							<Skeleton variant="text" width={48} />
						</Box>
						<Skeleton variant="text" width="75%" />
					</Box>
				</Box>
			))}
		</Box>
	);
}

function FolderEmptyState({ folder, onCompose }: { folder?: string; onCompose: () => void }) {
	const config = (folder && FOLDER_EMPTY_STATES[folder]) || {
		icon: <MailOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
		title: "No emails",
		description: "This folder is empty.",
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 12, px: 3, textAlign: "center" }}>
			<Box sx={{ mb: 2 }}>{config.icon}</Box>
			<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
				{config.title}
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, mb: 2.5 }}>
				{config.description}
			</Typography>
			{"showCompose" in config && config.showCompose && (
				<Button variant="contained" size="small" startIcon={<EditOutlinedIcon />} onClick={onCompose}>
					Compose
				</Button>
			)}
		</Box>
	);
}

export default function EmailListRoute() {
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();
	const { selectedEmailId, isComposing, selectEmail, closePanel, startCompose } = useUIStore();
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkBusy, setBulkBusy] = useState(false);

	const pageSize = usePrefs((p) => p.pageSize);
	const refreshSeconds = usePrefs((p) => p.refreshSeconds);
	const density = usePrefs((p) => p.density);
	const showSnippets = usePrefs((p) => p.showSnippets);
	const markReadOnOpen = usePrefs((p) => p.markReadOnOpen);
	const confirmBeforeDelete = usePrefs((p) => p.confirmBeforeDelete);

	const toast = useToast();
	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();

	const params = useMemo(
		() => ({
			folder: folder || "",
			page: String(page),
			limit: String(pageSize),
		}),
		[folder, page, pageSize],
	);

	const { data: emailData, isFetching: isRefreshing } = useEmails(mailboxId, params, {
		refetchInterval: refreshSeconds > 0 ? refreshSeconds * 1000 : undefined,
	});

	const emails = emailData?.emails ?? [];
	const totalCount = emailData?.totalCount ?? 0;

	const { data: folders = [] } = useFolders(mailboxId);

	const folderName = useMemo(() => {
		const found = folders.find((f) => f.id === folder);
		if (found) return found.name;
		return folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : "Inbox";
	}, [folders, folder]);

	const isPanelOpen = selectedEmailId !== null || isComposing;
	const selectedCount = selected.size;
	const allSelected = emails.length > 0 && emails.every((e) => selected.has(e.id));
	const someSelected = emails.some((e) => selected.has(e.id));

	// Track folder identity to detect folder changes vs page changes
	const prevFolderRef = useRef<string | undefined>(undefined);
	const lastClickedRef = useRef<number | null>(null);

	useEffect(() => {
		const folderChanged = prevFolderRef.current !== `${mailboxId}/${folder}`;
		prevFolderRef.current = `${mailboxId}/${folder}`;

		if (folderChanged) {
			closePanel();
			setPage(1);
		}
		setSelected(new Set());
		lastClickedRef.current = null;
	}, [mailboxId, folder, closePanel]);

	useEffect(() => {
		setSelected(new Set());
		lastClickedRef.current = null;
	}, [page]);

	const invalidateMail = () => {
		if (!mailboxId) return;
		queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
		queryClient.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) });
	};

	// ── selection ────────────────────────────────────────────────────
	const setSelection = (ids: string[]) => setSelected(new Set(ids));

	const toggleRow = (index: number, checked: boolean, shiftKey: boolean) => {
		const ids = emails.map((e) => e.id);
		let range: string[] = [];

		if (shiftKey && lastClickedRef.current !== null) {
			const a = Math.min(lastClickedRef.current, index);
			const b = Math.max(lastClickedRef.current, index);
			range = ids.slice(a, b + 1);
		}

		const next = new Set(selected);
		if (checked) {
			next.add(ids[index]);
			for (const id of range) next.add(id);
		} else {
			next.delete(ids[index]);
			if (range.length) for (const id of range) next.delete(id);
		}
		lastClickedRef.current = index;
		setSelected(next);
	};

	const toggleAll = (checked: boolean) => {
		setSelection(checked ? emails.map((e) => e.id) : []);
		lastClickedRef.current = null;
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const el = document.activeElement as HTMLElement | null;
			const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
			if (typing) return;
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !document.querySelector('[role="dialog"], [role="menu"]')) {
				e.preventDefault();
				toggleAll(true);
			}
			if (e.key === "Escape" && selected.size) {
				e.preventDefault();
				setSelection([]);
			}
			if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
				e.preventDefault();
				void bulkDelete();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// ── actions ──────────────────────────────────────────────────────
	const toggleStar = (e: React.MouseEvent, email: Email) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId)
			updateEmail.mutate({
				mailboxId,
				id: email.id,
				data: { starred: !email.starred },
			});
	};

	const handleDelete = async (e: React.MouseEvent, emailId: string) => {
		e.preventDefault();
		e.stopPropagation();
		if (!mailboxId) return;
		if (confirmBeforeDelete) {
			const ok = await confirmDialog({
				title: "Delete this email?",
				body: "It moves to Trash, where you can restore it.",
				confirmLabel: "Delete",
				destructive: true,
			});
			if (!ok) return;
		}
		deleteEmail.mutate(
			{ mailboxId, id: emailId },
			{ onError: () => toast.add({ title: "Could not delete the email", variant: "error" }) },
		);
		if (selectedEmailId === emailId) closePanel();

		const backTo = folder || Folders.INBOX;
		toast.add({
			title: folder === Folders.TRASH ? "Deleted" : "Moved to Trash",
			actions:
				folder === Folders.TRASH
					? undefined
					: [
							{
								children: "Undo",
								onClick: async () => {
									try {
										await api.moveEmail(mailboxId, emailId, backTo);
										invalidateMail();
									} catch {
										toast.add({ title: "Could not undo the delete", variant: "error" });
									}
								},
							},
						],
		});
	};

	async function bulkDelete() {
		if (!mailboxId || selected.size === 0) return;
		const ids = [...selected];
		if (confirmBeforeDelete) {
			const ok = await confirmDialog({
				title: `Delete ${ids.length} email${ids.length === 1 ? "" : "s"}?`,
				body: "They move to Trash, where you can restore them.",
				confirmLabel: "Delete",
				destructive: true,
			});
			if (!ok) return;
		}
		setBulkBusy(true);
		try {
			await Promise.all(ids.map((id) => api.deleteEmail(mailboxId, id)));
			if (selectedEmailId && ids.includes(selectedEmailId)) closePanel();
			setSelected(new Set());
			invalidateMail();
			const backTo = folder || Folders.INBOX;
			toast.add({
				title: `Moved ${ids.length} email${ids.length === 1 ? "" : "s"} to Trash`,
				actions:
					folder === Folders.TRASH
						? undefined
						: [
								{
									children: "Undo",
									onClick: async () => {
										try {
											await Promise.all(ids.map((id) => api.moveEmail(mailboxId, id, backTo)));
											invalidateMail();
										} catch {
											toast.add({ title: "Could not undo the delete", variant: "error" });
										}
									},
								},
						  ],
			});
		} catch {
			toast.add({ title: "Could not delete the selected emails", variant: "error" });
		} finally {
			setBulkBusy(false);
		}
	}

	async function bulkUpdate(data: { read?: boolean; starred?: boolean }) {
		if (!mailboxId || selected.size === 0) return;
		const ids = [...selected];
		setBulkBusy(true);
		try {
			await Promise.all(ids.map((id) => api.updateEmail(mailboxId, id, data)));
			invalidateMail();
			const n = ids.length;
			toast.add({
				title:
					data.read === true
						? `Marked ${n} as read`
						: data.read === false
							? `Marked ${n} as unread`
							: `Starred ${n} email${n === 1 ? "" : "s"}`,
			});
		} catch {
			toast.add({ title: "Could not update the selected emails", variant: "error" });
		} finally {
			setBulkBusy(false);
		}
	}

	async function bulkMove(folderId: string) {
		if (!mailboxId || selected.size === 0) return;
		const ids = [...selected];
		const backTo = folder || Folders.INBOX;
		const target = folders.find((f) => f.id === folderId)?.name ?? folderId;
		setBulkBusy(true);
		try {
			await Promise.all(ids.map((id) => api.moveEmail(mailboxId, id, folderId)));
			if (selectedEmailId && ids.includes(selectedEmailId)) closePanel();
			setSelected(new Set());
			invalidateMail();
			toast.add({
				title: `Moved ${ids.length} to ${target}`,
				actions: [
					{
						children: "Undo",
						onClick: async () => {
							try {
								await Promise.all(ids.map((id) => api.moveEmail(mailboxId, id, backTo)));
								invalidateMail();
							} catch {
								toast.add({ title: "Could not undo the move", variant: "error" });
							}
						},
					},
				],
			});
		} catch {
			toast.add({ title: "Could not move the selected emails", variant: "error" });
		} finally {
			setBulkBusy(false);
		}
	}

	const handleRefresh = () => {
		invalidateMail();
	};

	// Thread-aware helpers
	const hasUnread = (email: Email): boolean => {
		if (email.thread_unread_count !== undefined) {
			return email.thread_unread_count > 0;
		}
		return !email.read;
	};

	const handleRowClick = (email: Email) => {
		selectEmail(email.id);
		if (!mailboxId || !markReadOnOpen || !hasUnread(email)) return;
		if (email.thread_id && email.thread_count && email.thread_count > 1) {
			markThreadRead.mutate({ mailboxId, threadId: email.thread_id });
		} else {
			updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
		}
	};

	const formatParticipants = (email: Email): string => {
		if (email.participants) {
			const names = email.participants
				.split(",")
				.map((p) => p.trim().split("@")[0])
				.filter((name, idx, arr) => arr.indexOf(name) === idx);
			if (names.length <= 3) return names.join(", ");
			return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
		}
		return email.sender.split("@")[0];
	};

	const rowPy = rowPadding(density);

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			{/* Folder header */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					px: { xs: 2, md: 2.5 },
					py: 1.5,
					borderBottom: 1,
					borderColor: "divider",
					flexShrink: 0,
				}}
			>
				<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
					<Checkbox
						size="small"
						checked={allSelected}
						indeterminate={!allSelected && someSelected}
						onChange={(e) => toggleAll(e.target.checked)}
						disabled={emails.length === 0}
						slotProps={{ input: { "aria-label": "Select all conversations" } }}
					/>
					<Typography variant="h6" sx={{ fontSize: 18, fontWeight: 600 }}>
						{folderName}
					</Typography>
				</Box>
				<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
					{totalCount > 0 && (
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{ mr: 1, display: { xs: "none", sm: "block" } }}
						>
							{totalCount} conversation{totalCount !== 1 ? "s" : ""}
						</Typography>
					)}
					<Tooltip title={isRefreshing ? "Refreshing..." : "Refresh"}>
						<span>
							<IconButton size="small" onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh">
								<RefreshIcon
									fontSize="small"
									sx={{
										animation: isRefreshing ? "spin 1s linear infinite" : "none",
										"@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
									}}
								/>
							</IconButton>
						</span>
					</Tooltip>
				</Box>
			</Box>

			{/* Selection action bar */}
			{selectedCount > 0 && (
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 0.5,
						px: { xs: 1.5, md: 2 },
						py: 0.5,
						bgcolor: "action.selected",
						borderBottom: 1,
						borderColor: "divider",
						flexShrink: 0,
					}}
				>
					<Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
						{selectedCount} selected
					</Typography>
					<Tooltip title="Mark as read">
						<span>
							<IconButton size="small" aria-label="Mark selected as read" disabled={bulkBusy} onClick={() => void bulkUpdate({ read: true })}>
								<MarkEmailReadOutlinedIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title="Mark as unread">
						<span>
							<IconButton size="small" aria-label="Mark selected as unread" disabled={bulkBusy} onClick={() => void bulkUpdate({ read: false })}>
								<MarkEmailUnreadOutlinedIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title="Star">
						<span>
							<IconButton size="small" aria-label="Star selected" disabled={bulkBusy} onClick={() => void bulkUpdate({ starred: true })}>
								<StarBorderIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title={`Move to ${Folders.ARCHIVE}`}>
						<span>
							<IconButton size="small" aria-label="Archive selected" disabled={bulkBusy} onClick={() => void bulkMove(Folders.ARCHIVE)}>
								<ArchiveOutlinedIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title="Delete">
						<span>
							<IconButton size="small" color="error" aria-label="Delete selected" disabled={bulkBusy} onClick={() => void bulkDelete()}>
								<DeleteOutlinedIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
					<Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
					<Tooltip title="Clear selection">
						<IconButton size="small" aria-label="Clear selection" onClick={() => setSelection([])}>
							<CloseIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>
			)}

			{/* Email rows */}
			<Box sx={{ flex: 1, overflowY: "auto" }}>
				{isRefreshing && emails.length === 0 ? (
					<EmailListSkeleton />
				) : emails.length > 0 ? (
					<Box>
						{emails.map((email, index) => {
							const isSelected = selectedEmailId === email.id;
							const checked = selected.has(email.id);
							const snippet = getSnippetText(email.snippet);
							const unread = hasUnread(email);
							return (
								<Box
									key={email.id}
									className="mail-row"
									role="button"
									tabIndex={0}
									onClick={() => handleRowClick(email)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleRowClick(email);
										}
									}}
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1,
										width: "100%",
										textAlign: "left",
										cursor: "pointer",
										borderBottom: 1,
										borderColor: "divider",
										px: isPanelOpen ? { xs: 1.5, md: 1.5 } : { xs: 1.5, md: 2.5 },
										py: rowPy,
										bgcolor: checked ? "action.selected" : isSelected ? "action.focus" : "transparent",
										"&:hover": { bgcolor: checked ? "action.selected" : "action.hover" },
										"&:hover .row-actions": { display: "flex" },
									}}
								>
									<Checkbox
										size="small"
										checked={checked}
										onClick={(e) => e.stopPropagation()}
										onChange={(e) =>
											toggleRow(index, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)
										}
										slotProps={{ input: { "aria-label": `Select ${email.subject}` } }}
										sx={{ p: 0.5 }}
									/>

									{/* Unread dot */}
									<Box sx={{ width: 8, flexShrink: 0, display: "flex", justifyContent: "center" }}>
										{unread && <Box sx={{ height: 8, width: 8, borderRadius: "50%", bgcolor: "primary.main" }} />}
									</Box>

									{/* Star */}
									<IconButton
										size="small"
										aria-label={email.starred ? "Unstar" : "Star"}
										onClick={(e) => {
											e.stopPropagation();
											toggleStar(e, email);
										}}
										sx={{ p: 0.25, color: email.starred ? "warning.main" : "text.disabled" }}
									>
										{email.starred ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
									</IconButton>

									{/* Content */}
									<Box sx={{ minWidth: 0, flex: 1 }}>
										<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
											<Typography
												variant="body2"
												noWrap
												sx={{ fontWeight: unread ? 700 : 400, color: unread ? "text.primary" : "text.secondary" }}
											>
												{formatParticipants(email)}
											</Typography>
											{(email.thread_count ?? 1) > 1 && (
												<Chip
													size="small"
													label={email.thread_count}
													sx={{ height: 18, fontSize: 11, fontWeight: 500 }}
												/>
											)}
											{email.has_draft && (
												<Typography variant="caption" sx={{ color: "error.main", fontWeight: 500, flexShrink: 0 }}>
													Draft
												</Typography>
											)}
											{email.folder_id === Folders.SENT && <DeliveryBadge status={email.delivery_status} />}
											{email.needs_reply && !email.has_draft && (
												<Tooltip title="Needs reply">
													<ReplyIcon sx={{ fontSize: 14, color: "warning.main", flexShrink: 0 }} />
												</Tooltip>
											)}
											<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: "auto" }}>
												{formatListDate(email.date)}
											</Typography>
										</Box>
										<Typography variant="body2" noWrap sx={{ mt: 0.25 }}>
											<Box
												component="span"
												sx={{ fontWeight: unread ? 500 : 400, color: unread ? "text.primary" : "text.secondary" }}
											>
												{email.subject}
											</Box>
											{showSnippets && snippet && (
												<Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
													{" "}
													&mdash; {snippet}
												</Box>
											)}
										</Typography>
									</Box>

									{/* Hover actions */}
									<Box className="row-actions" sx={{ display: "none", alignItems: "center", flexShrink: 0 }}>
										<Tooltip title={email.read ? "Mark unread" : "Mark read"}>
											<IconButton
												size="small"
												aria-label={email.read ? "Mark unread" : "Mark read"}
												onClick={(e) => {
													e.stopPropagation();
													if (mailboxId)
														updateEmail.mutate({ mailboxId, id: email.id, data: { read: !email.read } });
												}}
											>
												{email.read ? (
													<MarkEmailUnreadOutlinedIcon sx={{ fontSize: 16 }} />
												) : (
													<MarkEmailReadOutlinedIcon sx={{ fontSize: 16 }} />
												)}
											</IconButton>
										</Tooltip>
										<Tooltip title="Delete">
											<IconButton
												size="small"
												aria-label="Delete"
												onClick={(e) => void handleDelete(e, email.id)}
											>
												<DeleteOutlinedIcon sx={{ fontSize: 16 }} />
											</IconButton>
										</Tooltip>
									</Box>
								</Box>
							);
						})}
					</Box>
				) : (
					<FolderEmptyState folder={folder} onCompose={() => startCompose()} />
				)}
			</Box>

			{/* Pagination */}
			{totalCount > pageSize && (
				<Box sx={{ display: "flex", justifyContent: "center", py: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
					<Pagination
						size="small"
						page={page}
						count={Math.max(1, Math.ceil(totalCount / pageSize))}
						onChange={(_, p) => setPage(p)}
					/>
				</Box>
			)}
		</MailboxSplitView>
	);
}
