// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Folders } from "shared/folders";
import EmailPanelDialogs from "~/components/email-panel/EmailPanelDialogs";
import EmailPanelHeader from "~/components/email-panel/EmailPanelHeader";
import ScheduledBanner from "./email-panel/ScheduledBanner";
import EmailPanelToolbar from "~/components/email-panel/EmailPanelToolbar";
import SingleMessageView from "~/components/email-panel/SingleMessageView";
import ThreadMessage from "~/components/email-panel/ThreadMessage";
import { splitEmailList, toEmailListValue } from "~/lib/utils";
import api from "~/services/api";
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
		return [email, ...threadReplies].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}, [email, threadReplies]);

	// Reset expanded state only when the selected email changes, not on every refetch.
	// Using allMessages as a dependency would reset user expand/collapse state on background refetches.
	const currentEmailId = email?.id;
	useEffect(() => { if (allMessages.length > 1) setExpandedMessages(new Set([allMessages[0].id])); }, [currentEmailId]); // eslint-disable-line react-hooks/exhaustive-deps

	const toggleExpand = (msgId: string) => { setExpandedMessages((prev) => { const next = new Set(prev); if (next.has(msgId)) next.delete(msgId); else next.add(msgId); return next; }); };

	const draftMessageIds = useMemo(() => {
		const ids = new Set<string>();
		for (const msg of allMessages) { if (msg.folder_id === Folders.DRAFT) ids.add(msg.id); else if (isDraftFolder && msg.id === emailId) ids.add(msg.id); }
		return ids;
	}, [allMessages, isDraftFolder, emailId]);

	const lastReceivedMessage = useMemo(() => {
		const ce = currentMailbox?.email;
		const received = allMessages.filter((msg) => !draftMessageIds.has(msg.id) && msg.sender !== ce);
		if (received.length > 0) return received[0];
		const nonDrafts = allMessages.filter((msg) => !draftMessageIds.has(msg.id));
		return nonDrafts.length > 0 ? nonDrafts[0] : email;
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
						}
					},
				},
			],
		});
		closePanel();
	};
	const handleDelete = async () => {
		if (!mailboxId) return;
		if (confirmBeforeDelete) {
			const ok = await confirmDialog({
				title: "Delete this email?",
				body: `${email.subject || "(no subject)"} — it moves to Trash.`,
				confirmLabel: "Delete",
				destructive: true,
			});
			if (!ok) return;
		}
		deleteEmailMut.mutate(
			{ mailboxId, id: email.id },
			{ onError: () => toast.add({ title: "Could not delete the email", variant: "error" }) },
		);
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
										await api.moveEmail(mailboxId, email.id, email.folder_id || folder || Folders.INBOX);
									} catch {
										toast.add({ title: "Could not undo the delete", variant: "error" });
									}
								},
							},
						],
		});
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

			<Box sx={{ flex: 1, overflowY: "auto" }}>
				{hasThread ? (
					allMessages.map((msg, idx) => {
						const isDraft = draftMessageIds.has(msg.id);
						return (
							<ThreadMessage
								key={msg.id}
								email={msg}
								mailboxId={mailboxId}
								mailboxEmail={currentMailbox?.email}
								isLast={idx === allMessages.length - 1}
								isDraft={isDraft}
								isSending={isDraft ? isSending : false}
								isExpanded={expandedMessages.has(msg.id)}
								onToggleExpand={() => toggleExpand(msg.id)}
								onSendDraft={isDraft ? () => handleSendDraft(msg) : undefined}
								onEditDraft={isDraft ? () => handleEditDraft(msg) : undefined}
								onDeleteDraft={isDraft ? () => handleDeleteDraft(msg) : undefined}
								onViewSource={() => setSourceViewEmail(msg)}
								onPreviewImage={(url, filename) => setPreviewImage({ url, filename })}
							/>
						);
					})
				) : (
					<SingleMessageView
						email={email}
						mailboxId={mailboxId}
						onPreviewImage={(url, filename) => setPreviewImage({ url, filename })}
					/>
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
