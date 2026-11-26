// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
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
import Chip from "@mui/material/Chip";
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
import { useDeleteEmail, useEmails, useMarkThreadRead, useUpdateEmail } from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";

const PAGE_SIZE = 25;

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

	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();

	const params = useMemo(
		() => ({
			folder: folder || "",
			page: String(page),
			limit: String(PAGE_SIZE),
		}),
		[folder, page],
	);

	const { data: emailData, isFetching: isRefreshing } = useEmails(mailboxId, params, {
		refetchInterval: 30_000,
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

	// Track folder identity to detect folder changes vs page changes
	const prevFolderRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		const folderChanged = prevFolderRef.current !== `${mailboxId}/${folder}`;
		prevFolderRef.current = `${mailboxId}/${folder}`;

		if (folderChanged) {
			closePanel();
			setPage(1);
		}
	}, [mailboxId, folder, closePanel]);

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

	const handleDelete = (e: React.MouseEvent, emailId: string) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId) {
			const confirmed = window.confirm("Are you sure you want to delete this email?");
			if (!confirmed) return;
			deleteEmail.mutate({ mailboxId, id: emailId });
			if (selectedEmailId === emailId) closePanel();
		}
	};

	const handleRefresh = () => {
		if (mailboxId) {
			queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
			queryClient.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) });
		}
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
		if (mailboxId && hasUnread(email)) {
			if (email.thread_id && email.thread_count && email.thread_count > 1) {
				markThreadRead.mutate({ mailboxId, threadId: email.thread_id });
			} else {
				updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } });
			}
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
				<Typography variant="h6" sx={{ fontSize: 18, fontWeight: 600 }}>
					{folderName}
				</Typography>
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

			{/* Email rows */}
			<Box sx={{ flex: 1, overflowY: "auto" }}>
				{isRefreshing && emails.length === 0 ? (
					<EmailListSkeleton />
				) : emails.length > 0 ? (
					<Box>
						{emails.map((email) => {
							const isSelected = selectedEmailId === email.id;
							const snippet = getSnippetText(email.snippet);
							const unread = hasUnread(email);
							return (
								<Box
									key={email.id}
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
										gap: 1.5,
										width: "100%",
										textAlign: "left",
										cursor: "pointer",
										borderBottom: 1,
										borderColor: "divider",
										px: isPanelOpen ? { xs: 2, md: 2 } : { xs: 2, md: 3 },
										py: isPanelOpen ? { xs: 1.25, md: 1.25 } : { xs: 1.25, md: 1.5 },
										bgcolor: isSelected ? "action.selected" : "transparent",
										"&:hover": { bgcolor: isSelected ? "action.selected" : "action.hover" },
										"&:hover .row-actions": { display: "flex" },
									}}
								>
									{/* Unread dot */}
									<Box sx={{ width: 10, flexShrink: 0, display: "flex", justifyContent: "center" }}>
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
											{snippet && (
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
												onClick={(e) => handleDelete(e, email.id)}
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
			{totalCount > PAGE_SIZE && (
				<Box sx={{ display: "flex", justifyContent: "center", py: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
					<Pagination
						size="small"
						page={page}
						count={Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
						onChange={(_, p) => setPage(p)}
					/>
				</Box>
			)}
		</MailboxSplitView>
	);
}
