// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteForeverOutlinedIcon from "@mui/icons-material/DeleteForeverOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import DraftsOutlinedIcon from "@mui/icons-material/DraftsOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import ForwardIcon from "@mui/icons-material/Forward";
import InboxIcon from "@mui/icons-material/Inbox";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import MarkEmailUnreadOutlinedIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ReplyIcon from "@mui/icons-material/Reply";
import ReplyAllIcon from "@mui/icons-material/ReplyAll";
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
import { useParams, useSearchParams } from "react-router";
import { isTyping, useShortcuts } from "~/shell/Shortcuts";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { DeliveryBadge } from "~/components/DeliveryBadge";
import { getSnippetText } from "~/lib/utils";
import { confirmDialog } from "~/lib/confirm";
import { rowPadding, usePrefs } from "~/lib/prefs";
import { useToast } from "~/lib/toast";
import api from "~/services/api";
import { useDeleteEmail, useEmails, useMarkThreadRead, useMoveEmail, useUpdateEmail } from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";
import { ActionButton, EmptyState, MenuEntry, PositionedMenu, SelectionBar, ViewHeader, ViewTitle } from "~/shell/View";
import Collapse from "@mui/material/Collapse";
import Fab from "@mui/material/Fab";
import Zoom from "@mui/material/Zoom";
import { TransitionGroup } from "react-transition-group";
import Avatar from "@mui/material/Avatar";
import CheckIcon from "@mui/icons-material/Check";
import { SwipeRow } from "~/components/SwipeRow";
import { avatarColor } from "~/components/email-panel/people";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { NAV_BAR_HEIGHT } from "~/shell/NavBar";
import { dateGroup, folderColor, folderIcon } from "~/lib/folders";
import Stack from "@mui/material/Stack";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

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
		icon: <TaskAltIcon />,
		title: "You're all caught up",
		description: "Nothing waiting in your inbox. New mail shows up here the moment it arrives.",
		showCompose: true,
	},
	[Folders.SENT]: {
		icon: <SendOutlinedIcon />,
		title: "No sent emails",
		description: "Emails you send will show up here.",
		showCompose: true,
	},
	[Folders.DRAFT]: {
		icon: <DraftsOutlinedIcon />,
		title: "No drafts",
		description: "Emails you're still working on will be saved here.",
		showCompose: true,
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveOutlinedIcon />,
		title: "Archive is empty",
		description: "Move emails here to keep your inbox clean without deleting them.",
	},
	[Folders.TRASH]: {
		icon: <DeleteOutlinedIcon />,
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
		icon: <MailOutlinedIcon />,
		title: "No emails",
		description: "This folder is empty.",
	};
	return (
		<Box sx={{ py: 10, px: 3 }}>
			<EmptyState
				icon={config.icon}
				title={config.title}
				body={config.description}
				action={
					"showCompose" in config && config.showCompose ? (
						<Box>
							<Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={onCompose}>
								Compose
							</Button>
						</Box>
					) : undefined
				}
			/>
		</Box>
	);
}

export default function EmailListRoute() {
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();
	const { selectedEmailId, isComposing, selectEmail, closePanel, startCompose } = useUIStore();

	// The open message lives in the URL (?open=<id>), so a refresh, a shared
	// link or a notification click lands on it. Whichever side changed last
	// wins: opening a message updates the URL, a new URL opens its message.
	const [searchParams, setSearchParams] = useSearchParams();
	// The page is in the URL too (?page=2), so a refresh stays on it.
	const page = Math.max(1, Number(searchParams.get("page")) || 1);
	const setPage = (p: number) =>
		setSearchParams((prev) => {
			const n = new URLSearchParams(prev);
			if (p > 1) n.set("page", String(p));
			else n.delete("page");
			return n;
		}, { replace: true });
	const openId = searchParams.get("open");
	const prevSync = useRef<{ sel: string | null; url: string | null } | undefined>(undefined);
	useEffect(() => {
		const sel = selectedEmailId ?? null;
		const url = openId ?? null;
		const prev = prevSync.current;
		prevSync.current = { sel, url };
		if (url === sel) return;
		const urlChanged = !prev || prev.url !== url;
		const selChanged = !prev || prev.sel !== sel;
		if (url && urlChanged) {
			// A new address (refresh, link, notification, back/forward) opens its message.
			selectEmail(url);
		} else if (selChanged || !url) {
			setSearchParams(
				(p) => {
					const n = new URLSearchParams(p);
					if (sel) n.set("open", sel);
					else n.delete("open");
					return n;
				},
				{ replace: true },
			);
		}
	}, [openId, selectedEmailId, selectEmail, setSearchParams]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const viewKey = `mail-list:${mailboxId}:${folder}:${page}`;
	const listRef = useRef<HTMLDivElement>(null);
	const [bulkBusy, setBulkBusy] = useState(false);

	const pageSize = usePrefs((p) => p.pageSize);
	const showAvatars = usePrefs((p) => p.showAvatars);
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
	const moveEmail = useMoveEmail();

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

	// The tab title, as in Gmail: "Inbox (3) – address – Mail".
	const folderUnread = folders.find((f) => f.id === folder)?.unreadCount ?? 0;
	useEffect(() => {
		document.title = `${folderName}${folderUnread ? ` (${folderUnread})` : ""} – ${mailboxId ?? ""} – Mail`;
	}, [folderName, folderUnread, mailboxId]);

	const isPanelOpen = selectedEmailId !== null || isComposing;
	const selectedCount = selected.size;
	const allSelected = emails.length > 0 && emails.every((e) => selected.has(e.id));
	const someSelected = emails.some((e) => selected.has(e.id));

	// Track folder identity to detect folder changes vs page changes
	const prevFolderRef = useRef<string | undefined>(undefined);
	const lastClickedRef = useRef<number | null>(null);

	useEffect(() => {
		const prev = prevFolderRef.current;
		prevFolderRef.current = `${mailboxId}/${folder}`;
		// Only a switch between folders closes the reading/compose pane; on first
		// load it may hold a compose started from another page.
		const folderChanged = prev !== undefined && prev !== `${mailboxId}/${folder}`;

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

	// Rows can disappear (deleted, moved, a background refresh): drop them from
	// the selection so "N selected" and bulk actions only cover visible rows.
	useEffect(() => {
		setSelected((prev) => {
			const visible = new Set(emails.map((e) => e.id));
			const kept = [...prev].filter((id) => visible.has(id));
			return kept.length === prev.size ? prev : new Set(kept);
		});
	}, [emails]);

	// A different page size reshuffles pages: start again at page 1.
	const prevPageSize = useRef(pageSize);
	useEffect(() => {
		if (prevPageSize.current !== pageSize) setPage(1);
		prevPageSize.current = pageSize;
	}, [pageSize]);

	// After deleting the last rows of the last page, step back to a page that exists.
	useEffect(() => {
		if (!emailData) return;
		const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
		if (page > lastPage) setPage(lastPage);
	}, [emailData, totalCount, pageSize, page]);

	/**
	 * Rows are conversations: the row id is the newest message. Expand to every
	 * message of each conversation in this folder, so moving or deleting a row
	 * doesn't leave its older messages behind.
	 */
	const expandRows = async (ids: string[]): Promise<string[]> => {
		if (!mailboxId) return ids;
		const out = new Set(ids);
		const rows = emails.filter((e) => out.has(e.id) && e.thread_id && (e.thread_count ?? 1) > 1);
		await Promise.all(
			rows.map(async (row) => {
				const messages = await api.getThread(mailboxId, row.thread_id!);
				for (const m of messages) if (m.folder_id === row.folder_id) out.add(m.id);
			}),
		);
		return [...out];
	};

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

	// Scroll position and selection come back after a refresh (this tab, per
	// folder and page), once the list has loaded.
	const rememberTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const rememberView = (patch: { top?: number; ids?: string[] }) => {
		clearTimeout(rememberTimer.current);
		rememberTimer.current = setTimeout(() => {
			try {
				const prev = JSON.parse(sessionStorage.getItem(viewKey) ?? "{}");
				sessionStorage.setItem(viewKey, JSON.stringify({ ...prev, ...patch }));
			} catch {}
		}, 150);
	};
	const restoredView = useRef<string | null>(null);
	useEffect(() => {
		if (!emails.length || restoredView.current === viewKey) return;
		restoredView.current = viewKey;
		try {
			const saved = JSON.parse(sessionStorage.getItem(viewKey) ?? "{}") as { top?: number; ids?: string[] };
			if (saved.ids?.length) {
				const here = new Set(emails.map((e) => e.id));
				const keep = saved.ids.filter((id) => here.has(id));
				if (keep.length) setSelected(new Set(keep));
			}
			if (saved.top) requestAnimationFrame(() => listRef.current?.scrollTo({ top: saved.top }));
		} catch {}
	}, [emails, viewKey]);
	useEffect(() => {
		if (restoredView.current === viewKey) rememberView({ ids: [...selected] });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected]);

	// ── keyboard (Gmail-style; "?" lists them, Settings can turn them off) ──
	// The cursor is the row j/k move to; actions without a selection use the
	// open message, else the cursor row.
	const [cursor, setCursor] = useState(-1);
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		if (!selectedEmailId) return;
		const i = emails.findIndex((e) => e.id === selectedEmailId);
		if (i >= 0) setCursor(i);
	}, [selectedEmailId, emails]);
	useEffect(() => setCursor(-1), [folder, page]);
	const shortcutsOn = usePrefs((p) => p.keyboardShortcuts);
	const cursorRow = cursor >= 0 ? emails[cursor] : undefined;
	const openRow = selectedEmailId ? emails.find((e) => e.id === selectedEmailId) : undefined;
	const focusRow = openRow ?? cursorRow;
	const keyTargets = () => (selected.size ? emails.filter((e) => selected.has(e.id)) : focusRow ? [focusRow] : []);
	const moveCursor = (delta: number) => {
		if (!emails.length) return;
		const next = Math.min(emails.length - 1, Math.max(0, (cursor < 0 ? (delta > 0 ? -1 : emails.length) : cursor) + delta));
		setCursor(next);
		document.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
		// With a message open, j/k step through messages, as in Gmail.
		if (selectedEmailId) handleRowClick(emails[next]);
	};
	useShortcuts(
		{
			j: () => moveCursor(1),
			k: () => moveCursor(-1),
			arrowdown: () => !selectedEmailId && moveCursor(1),
			arrowup: () => !selectedEmailId && moveCursor(-1),
			o: () => cursorRow && handleRowClick(cursorRow),
			enter: () => cursorRow && !selectedEmailId && handleRowClick(cursorRow),
			u: () => selectedEmailId && closePanel(),
			x: () => {
				if (!cursorRow) return;
				const next = new Set(selected);
				if (next.has(cursorRow.id)) next.delete(cursorRow.id);
				else next.add(cursorRow.id);
				setSelected(next);
			},
			"shift+a": () => toggleAll(selected.size !== emails.length),
			e: () => {
				const t = keyTargets();
				if (t.length && folder !== Folders.ARCHIVE) void bulkMove(Folders.ARCHIVE, t.map((r) => r.id));
			},
			"#": () => {
				const t = keyTargets();
				if (t.length) void bulkDelete(t.map((r) => r.id));
			},
			s: () => {
				const t = keyTargets();
				if (t.length) void bulkUpdate({ starred: !t.every((r) => r.starred) }, t.map((r) => r.id));
			},
			"shift+i": () => {
				const t = keyTargets();
				if (t.length) void bulkUpdate({ read: true }, t.map((r) => r.id));
			},
			"shift+u": () => {
				const t = keyTargets();
				if (t.length) void bulkUpdate({ read: false }, t.map((r) => r.id));
			},
			r: () => focusRow && void composeFrom(focusRow, "reply"),
			a: () => focusRow && void composeFrom(focusRow, "reply-all"),
			f: () => focusRow && void composeFrom(focusRow, "forward"),
			v: () => {
				const t = keyTargets();
				if (!t.length) return;
				const row = document.querySelector(`[data-row="${emails.indexOf(t[0])}"]`)?.getBoundingClientRect();
				setMoveMenu({ x: row ? row.left + 80 : window.innerWidth / 2, y: row ? row.bottom : window.innerHeight / 3, ids: t.map((r) => r.id) });
			},
			escape: () => selected.size && setSelection([]),
			delete: () => selected.size && void bulkDelete(),
			backspace: () => selected.size && void bulkDelete(),
		},
		shortcutsOn,
	);
	// Select-all is standard, so it works even with single-key shortcuts off.
	useShortcuts({
		"mod+a": () => {
			if (!isTyping()) toggleAll(true);
		},
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
		// Outside Trash, Delete moves to Trash (Undo moves it back). In Trash it is
		// deleted for good, with its attachments, and always asks first.
		const inTrash = folder === Folders.TRASH;
		if (inTrash || confirmBeforeDelete) {
			const ok = await confirmDialog(
				inTrash
					? {
							title: "Delete forever?",
							body: "This email and its attachments will be deleted permanently. This can't be undone.",
							confirmLabel: "Delete forever",
							destructive: true,
						}
					: {
							title: "Move this email to Trash?",
							body: "You can restore it from Trash.",
							confirmLabel: "Move to Trash",
							destructive: true,
						},
			);
			if (!ok) return;
		}
		if (selectedEmailId === emailId) closePanel();
		let ids = [emailId];
		try {
			ids = await expandRows([emailId]);
		} catch {
			// Fall back to the newest message alone.
		}
		if (inTrash) {
			for (const id of ids)
				deleteEmail.mutate({ mailboxId, id }, { onError: () => toast.add({ title: "Could not delete the email", variant: "error" }) });
			toast.add({ title: "Deleted forever" });
			return;
		}
		for (const id of ids)
			moveEmail.mutate(
				{ mailboxId, id, folderId: Folders.TRASH },
				{ onError: () => toast.add({ title: "Could not move the email to Trash", variant: "error" }) },
			);
		const backTo = folder || Folders.INBOX;
		toast.add({
			title: "Moved to Trash",
			actions: [
				{
					children: "Undo",
					onClick: async () => {
						try {
							await Promise.all(ids.map((id) => api.moveEmail(mailboxId, id, backTo)));
						} catch {
							toast.add({ title: "Could not undo the delete", variant: "error" });
						} finally {
							invalidateMail();
						}
					},
				},
			],
		});
	};

	async function bulkDelete(only?: string[]) {
		const ids = only ?? [...selected];
		if (!mailboxId || ids.length === 0) return;
		const n = `${ids.length} email${ids.length === 1 ? "" : "s"}`;
		const inTrash = folder === Folders.TRASH;
		if (inTrash || confirmBeforeDelete) {
			const ok = await confirmDialog(
				inTrash
					? {
							title: `Delete ${n} forever?`,
							body: "They and their attachments will be deleted permanently. This can't be undone.",
							confirmLabel: "Delete forever",
							destructive: true,
						}
					: {
							title: `Move ${n} to Trash?`,
							body: "You can restore them from Trash.",
							confirmLabel: "Move to Trash",
							destructive: true,
						},
			);
			if (!ok) return;
		}
		setBulkBusy(true);
		try {
			// Outside Trash this is a move, so Undo can bring them back.
			const all = await expandRows(ids);
			await Promise.all(all.map((id) => (inTrash ? api.deleteEmail(mailboxId, id) : api.moveEmail(mailboxId, id, Folders.TRASH))));
			if (selectedEmailId && ids.includes(selectedEmailId)) closePanel();
			setSelected(new Set());
			invalidateMail();
			const backTo = folder || Folders.INBOX;
			toast.add({
				title: inTrash ? `Deleted ${n} forever` : `Moved ${n} to Trash`,
				actions: inTrash
					? undefined
					: [
							{
								children: "Undo",
								onClick: async () => {
									try {
										await Promise.all(all.map((id) => api.moveEmail(mailboxId, id, backTo)));
									} catch {
										toast.add({ title: "Could not undo the delete", variant: "error" });
									} finally {
										invalidateMail();
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

	async function bulkUpdate(data: { read?: boolean; starred?: boolean }, only?: string[]) {
		const ids = only ?? [...selected];
		if (!mailboxId || ids.length === 0) return;
		setBulkBusy(true);
		try {
			if (data.read === true) {
				// Mark every message of each conversation read, so the unread dot and counts clear.
				const rows = emails.filter((e) => ids.includes(e.id));
				await Promise.all(rows.map((e) => (e.thread_id ? api.markThreadRead(mailboxId, e.thread_id) : api.updateEmail(mailboxId, e.id, data))));
			} else {
				await Promise.all(ids.map((id) => api.updateEmail(mailboxId, id, data)));
			}
			invalidateMail();
			const n = ids.length;
			toast.add({
				title:
					data.read === true
						? `Marked ${n} as read`
						: data.read === false
							? `Marked ${n} as unread`
							: data.starred === false
								? `Removed the star from ${n}`
								: `Starred ${n} email${n === 1 ? "" : "s"}`,
			});
		} catch {
			toast.add({ title: "Could not update the selected emails", variant: "error" });
		} finally {
			setBulkBusy(false);
		}
	}

	async function bulkMove(folderId: string, only?: string[]) {
		const ids = only ?? [...selected];
		if (!mailboxId || ids.length === 0) return;
		const backTo = folder || Folders.INBOX;
		const target = folders.find((f) => f.id === folderId)?.name ?? folderId;
		setBulkBusy(true);
		try {
			const all = await expandRows(ids);
			await Promise.all(all.map((id) => api.moveEmail(mailboxId, id, folderId)));
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
								await Promise.all(all.map((id) => api.moveEmail(mailboxId, id, backTo)));
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

	// ── right-click menu ─────────────────────────────────────────────
	const [menu, setMenu] = useState<{ x: number; y: number; email: Email | null } | null>(null);
	const [moveMenu, setMoveMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
	const moveTargets = folders.filter((f) => f.id !== folder && f.id !== Folders.DRAFT && f.id !== Folders.SENT);

	const openRowMenu = (e: React.MouseEvent, email: Email) => {
		e.preventDefault();
		e.stopPropagation();
		// Right-clicking an unselected row acts on that row alone, as in Drive.
		if (!selected.has(email.id)) setSelection([]);
		setMenu({ x: e.clientX, y: e.clientY, email });
	};

	/** The rows a menu action applies to: the selection if the row is in it, else the row. */
	const menuTargets = (email: Email) => (selected.has(email.id) ? emails.filter((e) => selected.has(e.id)) : [email]);

	const composeFrom = async (email: Email, mode: "reply" | "reply-all" | "forward") => {
		if (!mailboxId) return;
		try {
			const full = await api.getEmail(mailboxId, email.id);
			startCompose({ mode, originalEmail: full });
		} catch {
			toast.add({ title: "Could not open the email", variant: "error" });
		}
	};

	const rowMenuEntries = (email: Email) => {
		const targets = menuTargets(email);
		const ids = targets.map((t) => t.id);
		const one = targets.length === 1;
		const allRead = targets.every((t) => !hasUnread(t));
		const allStarred = targets.every((t) => t.starred);
		const run = (fn: () => unknown) => () => {
			setMenu(null);
			void fn();
		};
		return [
			one && <MenuEntry key="open" icon={<OpenInNewIcon fontSize="small" />} label="Open" hint="Enter" onClick={run(() => handleRowClick(email))} />,
			one && folder !== Folders.DRAFT && (
				<MenuEntry key="reply" icon={<ReplyIcon fontSize="small" />} label="Reply" onClick={run(() => composeFrom(email, "reply"))} />
			),
			one && folder !== Folders.DRAFT && (
				<MenuEntry key="reply-all" icon={<ReplyAllIcon fontSize="small" />} label="Reply all" onClick={run(() => composeFrom(email, "reply-all"))} />
			),
			one && folder !== Folders.DRAFT && (
				<MenuEntry key="forward" icon={<ForwardIcon fontSize="small" />} label="Forward" onClick={run(() => composeFrom(email, "forward"))} />
			),
			one && folder !== Folders.DRAFT && <Divider key="d1" />,
			<MenuEntry
				key="read"
				icon={allRead ? <MarkEmailUnreadOutlinedIcon fontSize="small" /> : <MarkEmailReadOutlinedIcon fontSize="small" />}
				label={allRead ? "Mark as unread" : "Mark as read"}
				onClick={run(() => bulkUpdate({ read: !allRead }, ids))}
			/>,
			<MenuEntry
				key="star"
				icon={allStarred ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
				label={allStarred ? "Remove star" : "Add star"}
				onClick={run(() => bulkUpdate({ starred: !allStarred }, ids))}
			/>,
			<Divider key="d2" />,
			folder !== Folders.ARCHIVE && folder !== Folders.TRASH && (
				<MenuEntry key="archive" icon={<ArchiveOutlinedIcon fontSize="small" />} label="Archive" onClick={run(() => bulkMove(Folders.ARCHIVE, ids))} />
			),
			(folder === Folders.ARCHIVE || folder === Folders.TRASH) && (
				<MenuEntry key="inbox" icon={<MoveToInboxOutlinedIcon fontSize="small" />} label="Move to Inbox" onClick={run(() => bulkMove(Folders.INBOX, ids))} />
			),
			moveTargets.length > 0 && (
				<MenuEntry
					key="move"
					icon={<DriveFileMoveOutlinedIcon fontSize="small" />}
					label="Move to…"
					onClick={() => {
						const at = menu;
						setMenu(null);
						if (at) setMoveMenu({ x: at.x, y: at.y, ids });
					}}
				/>
			),
			<Divider key="d3" />,
			<MenuEntry
				key="delete"
				icon={folder === Folders.TRASH ? <DeleteForeverOutlinedIcon fontSize="small" /> : <DeleteOutlinedIcon fontSize="small" />}
				label={folder === Folders.TRASH ? "Delete forever" : "Delete"}
				hint="Delete"
				danger={folder === Folders.TRASH}
				onClick={run(() => bulkDelete(ids))}
			/>,
		].filter(Boolean);
	};

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			<ViewHeader
				title={
					<Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
						<Checkbox
							checked={allSelected}
							indeterminate={!allSelected && someSelected}
							onChange={(e) => toggleAll(e.target.checked)}
							disabled={emails.length === 0}
							slotProps={{ input: { "aria-label": "Select all conversations" } }}
						/>
						<Box sx={{ flex: 1, minWidth: 0 }}>
							{selectedCount > 0 ? (
								<SelectionBar count={selectedCount} onClear={() => setSelection([])}>
									<ActionButton title="Mark as read" disabled={bulkBusy} onClick={() => void bulkUpdate({ read: true })}>
										<MarkEmailReadOutlinedIcon />
									</ActionButton>
									<ActionButton title="Mark as unread" disabled={bulkBusy} onClick={() => void bulkUpdate({ read: false })}>
										<MarkEmailUnreadOutlinedIcon />
									</ActionButton>
									<ActionButton title="Add star" disabled={bulkBusy} onClick={() => void bulkUpdate({ starred: true })}>
										<StarBorderIcon />
									</ActionButton>
									{folder !== Folders.ARCHIVE && folder !== Folders.TRASH && (
										<ActionButton title="Archive" disabled={bulkBusy} onClick={() => void bulkMove(Folders.ARCHIVE)}>
											<ArchiveOutlinedIcon />
										</ActionButton>
									)}
									{moveTargets.length > 0 && (
										<ActionButton
											title="Move to…"
											disabled={bulkBusy}
											onClick={(e) => {
												const r = e.currentTarget.getBoundingClientRect();
												setMoveMenu({ x: r.left, y: r.bottom, ids: [...selected] });
											}}
										>
											<DriveFileMoveOutlinedIcon />
										</ActionButton>
									)}
									<ActionButton title={folder === Folders.TRASH ? "Delete forever" : "Delete"} disabled={bulkBusy} onClick={() => void bulkDelete()}>
										{folder === Folders.TRASH ? <DeleteForeverOutlinedIcon /> : <DeleteOutlinedIcon />}
									</ActionButton>
								</SelectionBar>
							) : (
								<Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
									<Box
										aria-hidden
										sx={{
											display: { xs: "none", sm: "flex" },
											width: 36,
											height: 36,
											borderRadius: 2.5,
											alignItems: "center",
											justifyContent: "center",
											color: folderColor(folder ?? "inbox"),
											bgcolor: `color-mix(in srgb, ${folderColor(folder ?? "inbox")} 16%, transparent)`,
										}}
									>
										{folderIcon(folder ?? "inbox", { fontSize: "small" })}
									</Box>
									<ViewTitle>{folderName}</ViewTitle>
								</Stack>
							)}
						</Box>
					</Box>
				}
			>
				{totalCount > 0 && selectedCount === 0 && (
					<Typography variant="body2" color="text.secondary" sx={{ mr: 1, display: { xs: "none", sm: "block" }, whiteSpace: "nowrap" }}>
						{totalCount} conversation{totalCount !== 1 ? "s" : ""}
					</Typography>
				)}
			</ViewHeader>

			{/* Email rows */}
			<Box
				ref={listRef}
				sx={{ flex: 1, overflowY: "auto", containerType: "inline-size", containerName: "list" }}
				onScroll={(e) => {
					const top = (e.currentTarget as HTMLElement).scrollTop;
					setScrolled(top > 24);
					rememberView({ top });
				}}
				onContextMenu={(e) => {
					e.preventDefault();
					setMenu({ x: e.clientX, y: e.clientY, email: null });
				}}
			>
				{isRefreshing && emails.length === 0 ? (
					<EmailListSkeleton />
				) : emails.length > 0 ? (
					<TransitionGroup component={null}>
						{emails.flatMap((email, index) => {
							// A heading where the date group changes (Today, Yesterday, …).
							const group = dateGroup(email.date);
							const heading =
								index === 0 || dateGroup(emails[index - 1].date) !== group ? (
									<Collapse key={`group-${group}`} timeout={200}>
										<Typography
											component="h3"
											variant="caption"
											sx={{ display: "block", px: { xs: 2, md: 2.5 }, pt: index === 0 ? 1 : 2, pb: 0.75, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "text.secondary", borderBottom: 1, borderColor: "divider" }}
										>
											{group}
										</Typography>
									</Collapse>
								) : null;
							const isSelected = selectedEmailId === email.id;
							const checked = selected.has(email.id);
							const snippet = getSnippetText(email.snippet);
							const unread = hasUnread(email);
							const row = (
								<Collapse key={email.id} timeout={200}>
								<SwipeRow
									disabled={folder === Folders.ARCHIVE || folder === Folders.TRASH || folder === Folders.DRAFT}
									onSwipe={() => void bulkMove(Folders.ARCHIVE, [email.id])}
								>
								<Box
									className="mail-row"
									role="button"
									tabIndex={0}
									data-row={index}
									onClick={() => {
										setCursor(index);
										handleRowClick(email);
									}}
									onContextMenu={(e) => openRowMenu(e, email)}
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
										bgcolor: checked ? "action.selected" : isSelected ? "action.focus" : unread ? "var(--row-unread-bg)" : "var(--row-read-bg)",
										// The keyboard cursor (j/k): a bar on the left, as in Gmail.
										boxShadow: index === cursor && shortcutsOn ? "inset 3px 0 0 var(--mui-palette-primary-main)" : "none",
										"&:hover .row-actions": { display: "flex" },
										// Wide list: the hover actions take the date's place, as in Gmail.
										"@container list (min-width: 760px)": { "&:hover .row-meta": { display: "none" } },
										"&:hover": { bgcolor: checked ? "action.selected" : "action.hover", boxShadow: index === cursor && shortcutsOn ? "inset 3px 0 0 var(--mui-palette-primary-main)" : "inset 1px 0 0 var(--mui-palette-divider), inset -1px 0 0 var(--mui-palette-divider), 0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)", zIndex: 1, position: "relative" },
									}}
								>
									<Checkbox
										size="small"
										checked={checked}
										onClick={(e) => e.stopPropagation()}
										onKeyDown={(e) => {
											// Space/Enter toggle the box; don't let the row open the message. Other keys (Delete, Esc) still reach the list shortcuts.
											if (e.key === " " || e.key === "Enter") e.stopPropagation();
										}}
										onChange={(e) =>
											toggleRow(index, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)
										}
										slotProps={{ input: { "aria-label": `Select ${email.subject}` } }}
										sx={{ p: 0.5, display: { xs: "none", sm: "inline-flex" } }}
									/>
									<Avatar
										component="button"
										aria-label={checked ? `Deselect ${email.subject}` : `Select ${email.subject}`}
										aria-pressed={checked}
										onClick={(e: React.MouseEvent) => {
											e.stopPropagation();
											toggleRow(index, !checked, false);
										}}
										sx={{
											display: { xs: "flex", sm: "none" },
											width: 40,
											height: 40,
											flexShrink: 0,
											border: 0,
											cursor: "pointer",
											fontSize: 17,
											color: "#fff",
											bgcolor: checked ? "primary.main" : avatarColor(email.sender),
											transition: "background-color .15s, transform .15s",
											transform: checked ? "rotateY(180deg)" : "none",
										}}
									>
										{checked ? <CheckIcon sx={{ transform: "rotateY(180deg)" }} /> : formatParticipants(email).charAt(0).toUpperCase()}
									</Avatar>

									{/* Star */}
									<IconButton
										size="small"
										aria-label={email.starred ? "Unstar" : "Star"}
										onClick={(e) => {
											e.stopPropagation();
											toggleStar(e, email);
										}}
										sx={{ p: 0.25, color: email.starred ? "warning.main" : "text.disabled", display: { xs: "none", sm: "inline-flex" } }}
									>
										{email.starred ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
									</IconButton>
									{/* Larger screens: the sender's picture, if that preference is on. */}
									{showAvatars && (
										<Avatar aria-hidden sx={{ display: { xs: "none", sm: "flex" }, width: 32, height: 32, fontSize: 14, flexShrink: 0, color: "#fff", bgcolor: avatarColor(email.sender) }}>
											{formatParticipants(email).charAt(0).toUpperCase()}
										</Avatar>
									)}

									{/* Content. Narrow list: sender and date, then subject — snippet. Wide list: one line, as in Gmail. */}
									<Box
										sx={{
											minWidth: 0,
											flex: 1,
											display: "grid",
											gridTemplateColumns: "minmax(0, 1fr) auto",
											gridTemplateAreas: '"who meta" "what what" "snip snip"',
											columnGap: 1,
											alignItems: "center",
											"@container list (min-width: 760px)": {
												gridTemplateColumns: "minmax(0, 168px) minmax(0, 1fr) auto",
												gridTemplateAreas: '"who what meta"',
												columnGap: 2.5,
											},
										}}
									>
										<Box sx={{ gridArea: "who", display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
											<Typography variant="body2" noWrap sx={{ fontWeight: unread ? 700 : 400, color: "text.primary", minWidth: 0 }}>
												{formatParticipants(email)}
											</Typography>
											{(email.thread_count ?? 1) > 1 && (
												<Typography component="span" variant="caption" sx={{ color: "text.secondary", fontWeight: unread ? 700 : 400, flexShrink: 0 }}>
													{email.thread_count}
												</Typography>
											)}
											{email.has_draft && (
												<Typography variant="caption" sx={{ color: "error.main", fontWeight: 600, flexShrink: 0 }}>
													Draft
												</Typography>
											)}
											{email.folder_id === Folders.SENT && <DeliveryBadge status={email.delivery_status} />}
											{email.needs_reply && !email.has_draft && (
												<Tooltip title="Needs reply">
													<ReplyIcon sx={{ fontSize: 14, color: "warning.main", flexShrink: 0 }} />
												</Tooltip>
											)}
										</Box>
										<Typography variant="body2" noWrap sx={{ gridArea: "what", mt: 0.25, "@container list (min-width: 760px)": { mt: 0 } }}>
											<Box component="span" sx={{ fontWeight: unread ? 700 : 400, color: "text.primary" }}>
												{email.subject || "(no subject)"}
											</Box>
											{showSnippets && snippet && (
												<Box component="span" sx={{ color: "text.secondary", fontWeight: 400, display: { xs: "none", sm: "inline" } }}>
													{" "}
													&ndash; {snippet}
												</Box>
											)}
										</Typography>
										<Box className="row-meta" sx={{ gridArea: "meta", display: "flex", alignItems: "center", gap: 0.5, justifySelf: "end" }}>
											{email.has_attachments && (
												<Tooltip title="Has attachments">
													<AttachFileIcon aria-label="Has attachments" sx={{ fontSize: 16, color: "text.secondary", transform: "rotate(45deg)" }} />
												</Tooltip>
											)}
											<Typography variant="caption" sx={{ fontWeight: unread ? 700 : 400, color: unread ? "text.primary" : "text.secondary", whiteSpace: "nowrap", fontSize: 12 }}>
												{formatListDate(email.date)}
											</Typography>
										</Box>
										{showSnippets && snippet && (
											<Typography variant="body2" color="text.secondary" noWrap sx={{ gridArea: "snip", display: { xs: "block", sm: "none" } }}>
												{snippet}
											</Typography>
										)}
									</Box>
									<IconButton
										size="small"
										aria-label={email.starred ? "Unstar" : "Star"}
										onClick={(e) => {
											e.stopPropagation();
											toggleStar(e, email);
										}}
										sx={{ display: { xs: "inline-flex", sm: "none" }, alignSelf: "flex-end", color: email.starred ? "warning.main" : "text.disabled" }}
									>
										{email.starred ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
									</IconButton>

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
								</SwipeRow>
								</Collapse>
							);
							return heading ? [heading, row] : [row];
						})}
					</TransitionGroup>
				) : (
					<FolderEmptyState folder={folder} onCompose={() => startCompose()} />
				)}
			</Box>
			<Zoom in={!isComposing}>
				<Fab
					variant={scrolled ? "circular" : "extended"}
					aria-label="Compose"
					onClick={() => startCompose()}
					sx={{
						display: { xs: "inline-flex", md: "none" },
						position: "fixed",
						right: 16,
						// Above the phone navigation bar.
						bottom: `calc(${NAV_BAR_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px))`,
						zIndex: (t) => t.zIndex.speedDial,
						bgcolor: "primary.light",
						color: "primary.dark",
						borderRadius: 4,
						transition: "width .2s, padding .2s",
						"&:hover": { bgcolor: "primary.light" },
					}}
				>
					<EditOutlinedIcon sx={{ mr: scrolled ? 0 : 1 }} />
					{!scrolled && "Compose"}
				</Fab>
			</Zoom>

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
			{menu && (
				<PositionedMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
					{menu.email
						? rowMenuEntries(menu.email)
						: [
								<MenuEntry
									key="compose"
									icon={<EditOutlinedIcon fontSize="small" />}
									label="Compose"
									onClick={() => {
										setMenu(null);
										startCompose();
									}}
								/>,
							]}
				</PositionedMenu>
			)}
			{moveMenu && (
				<PositionedMenu x={moveMenu.x} y={moveMenu.y} onClose={() => setMoveMenu(null)}>
					{moveTargets.map((f) => (
						<MenuEntry
							key={f.id}
							icon={<FolderOutlinedIcon fontSize="small" />}
							label={f.name}
							onClick={() => {
								const ids = moveMenu.ids;
								setMoveMenu(null);
								void bulkMove(f.id, ids);
							}}
						/>
					))}
				</PositionedMenu>
			)}
		</MailboxSplitView>
	);
}
