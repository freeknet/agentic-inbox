// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ForwardOutlinedIcon from "@mui/icons-material/ForwardOutlined";
import ReplyAllOutlinedIcon from "@mui/icons-material/ReplyAllOutlined";
import ReplyOutlinedIcon from "@mui/icons-material/ReplyOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Folders } from "shared/folders";
import EmailPanelDialogs from "~/components/email-panel/EmailPanelDialogs";
import EmailPanelHeader from "~/components/email-panel/EmailPanelHeader";
import ScheduledBanner from "./email-panel/ScheduledBanner";
import EmailPanelToolbar from "~/components/email-panel/EmailPanelToolbar";
import ThreadMessage from "~/components/email-panel/ThreadMessage";
import { splitEmailList, toEmailListValue } from "~/lib/utils";
import api from "~/services/api";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteEmail, useEmail, useMoveEmail, useReplyToEmail, useSendEmail, useThreadReplies, useUpdateEmail } from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";
import { useSendFeedback } from "~/hooks/useSendFeedback";
import { confirmDialog } from "~/lib/confirm";
import { useToast } from "~/lib/toast";
import { usePrefs } from "~/lib/prefs";
import type { Email, Folder, Mailbox } from "~/types";

function EmailPanelSkeleton() {
	return (
		<Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
			<Skeleton variant="text" width="66%" height={24} />
			<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
				<Skeleton variant="circular" width={40} height={40} />
				<Box sx={{ flex: 1 }}>
					<Skeleton variant="text" width={160} />
					<Skeleton variant="text" width={96} />
				</Box>
			</Box>
			<Box sx={{ pt: 2 }}>
				<Skeleton variant="text" width="100%" />
				<Skeleton variant="text" width="83%" />
				<Skeleton variant="text" width="66%" />
				<Skeleton variant="text" width="75%" />
			</Box>
		</Box>
	);
}

export default function EmailPanel({ emailId }: { emailId: string }) {
	const { mailboxId, folder } = useParams<{ mailboxId: string; folder: string }>();
	const { data: email } = useEmail(mailboxId, emailId) as { data?: Email };
	const { data: threadRepliesRaw } = useThreadReplies(mailboxId, email?.thread_id) as {
		data?: Email[];
	};
	const updateEmail = useUpdateEmail();
	const deleteEmailMut = useDeleteEmail();
	const moveEmailMut = useMoveEmail();
	const sendEmailMut = useSendEmail();
	const replyMut = useReplyToEmail();
	const { data: folders = [] } = useFolders(mailboxId) as { data?: Folder[] };
	const { data: currentMailbox } = useMailbox(mailboxId) as {
		data?: Mailbox;
	};
	const { closePanel, startCompose } = useUIStore();
	const toast = useToast();
	const queryClient = useQueryClient();
	const refreshMail = () => {
		if (!mailboxId) return;
		void queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
		void queryClient.invalidateQueries({ queryKey: ["folders", mailboxId] });
	};
	const { confirmSuppressed, notifyQueued } = useSendFeedback();
	const [isSending, setIsSending] = useState(false);
	const [sourceViewEmail, setSourceViewEmail] = useState<Email | null>(null);
	const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
	const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);
	const isDraftFolder = folder === Folders.DRAFT;
	const confirmBeforeDelete = usePrefs((p) => p.confirmBeforeDelete);

	const threadReplies = useMemo(() => {
		if (!threadRepliesRaw || !email) return [];
		return threadRepliesRaw.filter((e) => e.id !== email.id);
	}, [threadRepliesRaw, email]);

	const allMessages = useMemo(() => {
		if (!email) return [];
		// Oldest first, newest at the bottom, as in Gmail.
		return [email, ...threadReplies].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
	}, [email, threadReplies]);

	// Gmail opens the newest message, unread ones and drafts; the rest are one line.
	// Reset only when the selected email (or the thread's size) changes, not on
	// every refetch, so the reader's own expand/collapse choices stay.
	const [showAllMessages, setShowAllMessages] = useState(false);
	const currentEmailId = email?.id;
	const messageCount = allMessages.length;
	useEffect(() => {
		const ids = new Set(allMessages.filter((m) => !m.read || m.folder_id === Folders.DRAFT).map((m) => m.id));
		const last = allMessages.at(-1);
		if (last) ids.add(last.id);
		setExpandedMessages(ids);
		setShowAllMessages(false);
	}, [currentEmailId, messageCount]); // eslint-disable-line react-hooks/exhaustive-deps

	const toggleExpand = (msgId: string) => { setExpandedMessages((prev) => { const next = new Set(prev); if (next.has(msgId)) next.delete(msgId); else next.add(msgId); return next; }); };

	const draftMessageIds = useMemo(() => {
		const ids = new Set<string>();
		for (const msg of allMessages) { if (msg.folder_id === Folders.DRAFT) ids.add(msg.id); else if (isDraftFolder && msg.id === emailId) ids.add(msg.id); }
		return ids;
	}, [allMessages, isDraftFolder, emailId]);

	const lastReceivedMessage = useMemo(() => {
		const ce = currentMailbox?.email;
		const received = allMessages.filter((msg) => !draftMessageIds.has(msg.id) && msg.sender !== ce);
		if (received.length > 0) return received[received.length - 1];
		const nonDrafts = allMessages.filter((msg) => !draftMessageIds.has(msg.id));
		return nonDrafts.length > 0 ? nonDrafts[nonDrafts.length - 1] : email;
	}, [allMessages, draftMessageIds, currentMailbox?.email, email]);

	const moveToFolders = useMemo(() => { const cur = folder || email?.folder_id; return folders.filter((f) => f.id !== cur); }, [folders, folder, email?.folder_id]);

	if (!email) return <EmailPanelSkeleton />;

	const toggleStar = () => { if (mailboxId) updateEmail.mutate({ mailboxId, id: email.id, data: { starred: !email.starred } }); };
	const handleMove = (folderId: string) => {
		if (!mailboxId) return;
		const from = email.folder_id;
		const target = folders.find((f) => f.id === folderId)?.name ?? "folder";
		moveEmailMut.mutate(
			{ mailboxId, id: email.id, folderId },
			{ onError: () => toast.add({ title: "Could not move the email", variant: "error" }) },
		);
		toast.add({
			title: `Moved to ${target}`,
			actions: [
				{
					children: "Undo",
					onClick: async () => {
						try {
							await api.moveEmail(mailboxId, email.id, from || Folders.INBOX);
						} catch {
							toast.add({ title: "Could not undo the move", variant: "error" });
						} finally {
							refreshMail();
						}
					},
				},
			],
		});
		closePanel();
	};
	/**
	 * Outside Trash, Delete moves the email to Trash (Undo moves it back). In
	 * Trash it is deleted for good, with its attachments, and always asks first.
	 */
	const handleDelete = async () => {
		if (!mailboxId) return;
		const from = email.folder_id || folder || Folders.INBOX;
		const inTrash = from === Folders.TRASH;
		if (inTrash || confirmBeforeDelete) {
			const ok = await confirmDialog(
				inTrash
					? {
							title: "Delete forever?",
							body: `${email.subject || "(no subject)"} and its attachments will be deleted permanently. This can't be undone.`,
							confirmLabel: "Delete forever",
							destructive: true,
						}
					: {
							title: "Move this email to Trash?",
							body: `${email.subject || "(no subject)"} — you can restore it from Trash.`,
							confirmLabel: "Move to Trash",
							destructive: true,
						},
			);
			if (!ok) return;
		}
		if (inTrash) {
			deleteEmailMut.mutate(
				{ mailboxId, id: email.id },
				{ onError: () => toast.add({ title: "Could not delete the email", variant: "error" }) },
			);
			toast.add({ title: "Deleted forever" });
		} else {
			moveEmailMut.mutate(
				{ mailboxId, id: email.id, folderId: Folders.TRASH },
				{ onError: () => toast.add({ title: "Could not move the email to Trash", variant: "error" }) },
			);
			toast.add({
				title: "Moved to Trash",
				actions: [
					{
						children: "Undo",
						onClick: async () => {
							try {
								await api.moveEmail(mailboxId, email.id, from);
							} catch {
								toast.add({ title: "Could not undo the delete", variant: "error" });
							} finally {
								refreshMail();
							}
						},
					},
				],
			});
		}
		closePanel();
	};

	const handleEditDraft = (draftMsg?: Email) => {
		const target = draftMsg || email;
		if (target.in_reply_to) { startCompose({ mode: "reply", originalEmail: allMessages.find((msg) => msg.id === target.in_reply_to), draftEmail: target }); }
		else { startCompose({ mode: "new", originalEmail: undefined, draftEmail: target }); }
	};

	const handleDeleteDraft = async (draftMsg?: Email) => {
		const target = draftMsg || email;
		if (!mailboxId) return;
		const ok = await confirmDialog({
			title: "Discard this draft?",
			body: "The draft is deleted and cannot be recovered.",
			confirmLabel: "Discard",
			destructive: true,
		});
		if (!ok) return;
		deleteEmailMut.mutate({ mailboxId, id: target.id });
		toast.add({ title: "Draft discarded" });
		if (target.id === emailId) closePanel();
	};

	const handleSendDraft = async (draftMsg?: Email) => {
		let target = draftMsg || email;
		if (!mailboxId || !currentMailbox) return;
		setIsSending(true);
		try {
			if (!target.recipient || !target.subject) { try { const fresh = await api.getEmail(mailboxId, target.id) as Email; if (fresh) target = fresh; } catch {} }
			if (!target.recipient) { toast.add({ title: "Cannot send: no recipient set on this draft.", variant: "error" }); return; }
			const toRecipients = splitEmailList(target.recipient);
			if (toRecipients.length === 0) { toast.add({ title: "Cannot send: no valid recipient set on this draft.", variant: "error" }); return; }
			const fromName = currentMailbox.settings?.fromName || currentMailbox.name;
			const from = fromName && fromName !== currentMailbox.email ? { email: currentMailbox.email, name: fromName } : currentMailbox.email;
			const originalEmail = target.in_reply_to ? allMessages.find((msg) => msg.id === target.in_reply_to) : undefined;
			const emailData = {
				to: toEmailListValue(toRecipients),
				cc: toEmailListValue(splitEmailList(target.cc)),
				bcc: toEmailListValue(splitEmailList(target.bcc)),
				from,
				subject: target.subject || "(no subject)",
				html: target.body || "",
				text: target.body ? target.body.replace(/<[^>]*>/g, "").trim() : "",
			};
			if (!(await confirmSuppressed(mailboxId, [...toRecipients, ...splitEmailList(target.cc), ...splitEmailList(target.bcc)]))) return;
			// draft_id: the server moves the draft into the outbox atomically (B9).
			const payload = { ...emailData, draft_id: target.id };
			const result = originalEmail
				? await replyMut.mutateAsync({ mailboxId, emailId: originalEmail.id, email: payload })
				: await sendEmailMut.mutateAsync({ mailboxId, email: payload });
			notifyQueued(mailboxId, result);
			if (isDraftFolder) closePanel();
		} catch (err) {
			const message = (err instanceof Error ? err.message : null) || "Failed to send email.";
			toast.add({ title: message, variant: "error" });
		} finally { setIsSending(false); }
	};

	const hasThread = allMessages.length > 1;

	// Long conversations fold their middle into "N older messages" (Gmail does
	// this past four), unless one of those is open or the reader unfolded it.
	type Row = { kind: "msg"; msg: Email } | { kind: "fold"; count: number };
	const middle = allMessages.slice(1, -2);
	const fold = !showAllMessages && middle.length >= 2 && middle.every((m) => !expandedMessages.has(m.id));
	const visibleMessages: Row[] = fold
		? [{ kind: "msg", msg: allMessages[0] }, { kind: "fold", count: middle.length }, ...allMessages.slice(-2).map((msg) => ({ kind: "msg" as const, msg }))]
		: allMessages.map((msg) => ({ kind: "msg" as const, msg }));

	// The reply bar under the conversation answers its latest received message.
	const replyTarget = isDraftFolder || allMessages.every((m) => draftMessageIds.has(m.id)) ? null : lastReceivedMessage;
	const replyAllUseful =
		!!replyTarget &&
		splitEmailList(replyTarget.recipient).length + splitEmailList(replyTarget.cc).length + (replyTarget.sender === currentMailbox?.email ? 0 : 1) > 2;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<EmailPanelToolbar
				email={email}
				mailboxId={mailboxId}
				isDraftFolder={isDraftFolder}
				isSending={isSending}
				moveToFolders={moveToFolders}
				onBack={closePanel}
				onSendDraft={() => handleSendDraft()}
				onEditDraft={() => handleEditDraft()}
				onReply={() =>
					startCompose({ mode: "reply", originalEmail: lastReceivedMessage })
				}
				onReplyAll={() =>
					startCompose({
						mode: "reply-all",
						originalEmail: lastReceivedMessage,
					})
				}
				onForward={() => startCompose({ mode: "forward", originalEmail: email })}
				onToggleStar={toggleStar}
				onToggleRead={() => {
					if (mailboxId) {
						updateEmail.mutate({
							mailboxId,
							id: email.id,
							data: { read: !email.read },
						});
					}
				}}
				onMove={handleMove}
				onViewSource={() => setSourceViewEmail(email)}
				onDelete={() => void handleDelete()}
			/>

			<EmailPanelHeader
				subject={email.subject}
				messageCount={allMessages.length}
				showThreadCount={hasThread}
			/>

			{mailboxId && allMessages.filter((m) => m.delivery_status === "queued").map((m) => (
				<ScheduledBanner key={m.id} mailboxId={mailboxId} emailId={m.id} />
			))}

			<Box sx={{ flex: 1, overflowY: "auto", pb: 3, containerType: "inline-size", containerName: "thread" }}>
				{visibleMessages.map((item) =>
					item.kind === "fold" ? (
						<OlderMessagesFold key="fold" count={item.count} onClick={() => setShowAllMessages(true)} />
					) : (
						<ThreadMessage
							key={item.msg.id}
							email={item.msg}
							mailboxId={mailboxId}
							mailboxEmail={currentMailbox?.email}
							isDraft={draftMessageIds.has(item.msg.id)}
							isSending={draftMessageIds.has(item.msg.id) ? isSending : false}
							isExpanded={expandedMessages.has(item.msg.id)}
							canCollapse={item.msg.id !== allMessages.at(-1)?.id}
							onToggleExpand={() => toggleExpand(item.msg.id)}
							onReply={() => startCompose({ mode: "reply", originalEmail: item.msg })}
							onReplyAll={() => startCompose({ mode: "reply-all", originalEmail: item.msg })}
							onForward={() => startCompose({ mode: "forward", originalEmail: item.msg })}
							onToggleStar={() => {
								if (mailboxId) updateEmail.mutate({ mailboxId, id: item.msg.id, data: { starred: !item.msg.starred } });
							}}
							onSendDraft={draftMessageIds.has(item.msg.id) ? () => handleSendDraft(item.msg) : undefined}
							onEditDraft={draftMessageIds.has(item.msg.id) ? () => handleEditDraft(item.msg) : undefined}
							onDeleteDraft={draftMessageIds.has(item.msg.id) ? () => handleDeleteDraft(item.msg) : undefined}
							onViewSource={() => setSourceViewEmail(item.msg)}
							onPreviewImage={(url, filename) => setPreviewImage({ url, filename })}
						/>
					),
				)}

				{replyTarget && (
					<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, px: { xs: 2, md: 3 }, pt: 2.5, "@container thread (min-width: 560px)": { pl: 10 }, borderTop: 1, borderColor: "divider" }}>
						<Button variant="outlined" startIcon={<ReplyOutlinedIcon />} onClick={() => startCompose({ mode: "reply", originalEmail: replyTarget })} sx={replyButtonSx}>
							Reply
						</Button>
						{replyAllUseful && (
							<Button variant="outlined" startIcon={<ReplyAllOutlinedIcon />} onClick={() => startCompose({ mode: "reply-all", originalEmail: replyTarget })} sx={replyButtonSx}>
								Reply all
							</Button>
						)}
						<Button variant="outlined" startIcon={<ForwardOutlinedIcon />} onClick={() => startCompose({ mode: "forward", originalEmail: allMessages.filter((m) => !draftMessageIds.has(m.id)).at(-1) ?? email })} sx={replyButtonSx}>
							Forward
						</Button>
					</Box>
				)}
			</Box>

			<EmailPanelDialogs
				sourceViewEmail={sourceViewEmail}
				previewImage={previewImage}
				onCloseSource={() => setSourceViewEmail(null)}
				onClosePreview={() => setPreviewImage(null)}
			/>
		</Box>
	);
}

const replyButtonSx = { borderRadius: 999, px: 2.5, color: "text.secondary", borderColor: "divider", textTransform: "none" } as const;

/**
 * Gmail's fold: a doubled rule with a count bubble sitting on it; clicking
 * either shows the hidden messages.
 */
function OlderMessagesFold({ count, onClick }: { count: number; onClick: () => void }) {
	return (
		<ButtonBase
			onClick={onClick}
			aria-label={`Show ${count} older messages`}
			sx={{
				position: "relative",
				display: "block",
				width: "100%",
				height: 44,
				borderTop: 1,
				borderColor: "divider",
				// The doubled rule runs through the middle, under the bubble.
				"&::before, &::after": { content: '""', position: "absolute", left: 0, right: 0, borderTop: 1, borderColor: "divider" },
				"&::before": { top: 19 },
				"&::after": { top: 23 },
				"&:hover .fold-count": { bgcolor: "action.hover", color: "text.primary" },
			}}
		>
			<Box
				className="fold-count"
				component="span"
				sx={{
					position: "absolute",
					zIndex: 1,
					left: { xs: 16, md: 24 },
					top: "50%",
					transform: "translateY(-50%)",
					width: 36,
					height: 36,
					borderRadius: "50%",
					border: 1,
					borderColor: "divider",
					bgcolor: "background.paper",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					typography: "body2",
					fontWeight: 500,
					color: "text.secondary",
					transition: "background-color .15s, color .15s",
				}}
			>
				{count}
			</Box>
		</ButtonBase>
	);
}
