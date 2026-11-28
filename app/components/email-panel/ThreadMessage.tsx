// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CodeIcon from "@mui/icons-material/Code";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ForwardOutlinedIcon from "@mui/icons-material/ForwardOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ReplyAllOutlinedIcon from "@mui/icons-material/ReplyAllOutlined";
import ReplyOutlinedIcon from "@mui/icons-material/ReplyOutlined";
import SendIcon from "@mui/icons-material/Send";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import { useInlineImages } from "~/hooks/useInlineImages";
import { formatDetailDate, splitEmailList, stripHtml } from "~/lib/utils";
import type { Email } from "~/types";
import { avatarColor, messageDate, relativeTime, senderName, shortAddress } from "./people";
import { SenderCard } from "./SenderCard";

interface ThreadMessageProps {
	email: Email;
	mailboxId?: string;
	mailboxEmail?: string;
	isDraft?: boolean;
	isSending?: boolean;
	isExpanded: boolean;
	/** The latest message can't be collapsed (as in Gmail). */
	canCollapse?: boolean;
	onToggleExpand: () => void;
	onReply?: () => void;
	onReplyAll?: () => void;
	onForward?: () => void;
	onToggleStar?: () => void;
	onSendDraft?: () => void;
	onEditDraft?: () => void;
	onDeleteDraft?: () => void;
	onViewSource?: () => void;
	onPreviewImage?: (url: string, filename: string) => void;
}

/** Room for the avatar column; bodies and attachments line up after it. */
const WIDE = "@container thread (min-width: 560px)";
/** Body indent after the avatar, once the pane (not the window) has room. */
const INDENT = { ml: 0, [WIDE]: { ml: "56px" } } as const;

function SenderAvatar({ email, isDraft, isSelf }: { email: Email; isDraft?: boolean; isSelf: boolean }) {
	const name = senderName(email) ?? email.sender;
	return (
		<Avatar
			sx={{
				width: 40,
				height: 40,
				flexShrink: 0,
				fontSize: 18,
				bgcolor: isDraft ? "action.selected" : isSelf ? "primary.main" : avatarColor(email.sender),
				color: isDraft ? "text.secondary" : isSelf ? "primary.contrastText" : "#fff",
			}}
		>
			{isDraft ? <EditOutlinedIcon fontSize="small" /> : name.charAt(0).toUpperCase()}
		</Avatar>
	);
}

/** "to me, amy ▾" with the full header details in a popover. */
function RecipientsLine({ email, mailboxEmail }: { email: Email; mailboxEmail?: string }) {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const to = splitEmailList(email.recipient);
	const cc = splitEmailList(email.cc);
	const bcc = splitEmailList(email.bcc);
	const names = [...to, ...cc, ...bcc].map((a) => shortAddress(a, mailboxEmail));
	const label = names.length ? `to ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}` : "to undisclosed recipients";
	const name = senderName(email);
	const rows: [string, string][] = [
		["from:", name ? `${name} <${email.sender}>` : email.sender],
		["to:", to.join(", ") || "undisclosed recipients"],
		...(cc.length ? [["cc:", cc.join(", ")] as [string, string]] : []),
		...(bcc.length ? [["bcc:", bcc.join(", ")] as [string, string]] : []),
		["date:", formatDetailDate(email.date)],
		["subject:", email.subject || "(no subject)"],
	];
	return (
		<>
			<ButtonBase
				onClick={(e) => {
					e.stopPropagation();
					setAnchor(e.currentTarget);
				}}
				aria-label="Show details"
				sx={{ borderRadius: 1, color: "text.secondary", typography: "caption", maxWidth: "100%", justifyContent: "flex-start" }}
			>
				<Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
					{label}
				</Box>
				<ArrowDropDownIcon sx={{ fontSize: 18 }} />
			</ButtonBase>
			<Popover
				open={!!anchor}
				anchorEl={anchor}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
				slotProps={{ paper: { sx: { p: 2, maxWidth: 520, borderRadius: 2 } } }}
			>
				<Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.75 }}>
					{rows.map(([k, v]) => (
						<Box key={k} sx={{ display: "contents" }}>
							<Typography component="dt" variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
								{k}
							</Typography>
							<Typography component="dd" variant="caption" sx={{ m: 0, wordBreak: "break-word" }}>
								{v}
							</Typography>
						</Box>
					))}
				</Box>
			</Popover>
		</>
	);
}

/**
 * One message in the conversation, laid out like Gmail: collapsed it is one
 * line (sender, snippet, date); expanded it shows the sender with address,
 * recipients with details, date with how long ago, star, reply and a menu,
 * then the body (quoted history trimmed) and attachments.
 */
export default function ThreadMessage({
	email,
	mailboxId,
	mailboxEmail,
	isDraft,
	isSending,
	isExpanded,
	canCollapse = true,
	onToggleExpand,
	onReply,
	onReplyAll,
	onForward,
	onToggleStar,
	onSendDraft,
	onEditDraft,
	onDeleteDraft,
	onViewSource,
	onPreviewImage,
}: ThreadMessageProps) {
	// Called before the collapsed early return so hook order stays stable.
	const inlineBody = useInlineImages(isExpanded ? email.body || "" : "", mailboxId, email.id, email.attachments);
	const [menu, setMenu] = useState<HTMLElement | null>(null);
	const isSelf = !!mailboxEmail && email.sender.toLowerCase() === mailboxEmail.toLowerCase();
	const name = isDraft ? "Draft" : (senderName(email) ?? (isSelf ? "me" : email.sender));
	const unread = !email.read && !isSelf;
	const ago = relativeTime(email.date);
	const draftAccent = isDraft ? { borderLeft: 3, borderColor: "warning.main" } : {};

	if (!isExpanded) {
		const snippet = email.snippet || stripHtml(email.body || "").replace(/\s+/g, " ").slice(0, 160);
		return (
			<ButtonBase
				onClick={onToggleExpand}
				aria-expanded={false}
				sx={{
					width: "100%",
					display: "flex",
					alignItems: "center",
					gap: 2,
					px: { xs: 2, md: 3 },
					py: 1.25,
					textAlign: "left",
					justifyContent: "flex-start",
					borderTop: 1,
					borderColor: "divider",
					"&:hover": { bgcolor: "action.hover" },
					...draftAccent,
				}}
			>
				<SenderAvatar email={email} isDraft={isDraft} isSelf={isSelf} />
				<Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", columnGap: 2, [WIDE]: { flexDirection: "row" } }}>
					<Typography variant="body2" noWrap sx={{ fontWeight: 700, flexShrink: 0, color: isDraft ? "error.main" : undefined, [WIDE]: { maxWidth: "40%" } }}>
						{name}
					</Typography>
					<Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
						{snippet}
					</Typography>
				</Box>
				<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontWeight: unread ? 700 : 400 }}>
					{messageDate(email.date)}
				</Typography>
			</ButtonBase>
		);
	}

	return (
		<Box sx={{ borderTop: 1, borderColor: "divider", px: { xs: 2, md: 3 }, pt: 2, pb: 2.5, ...draftAccent }}>
			<Box
				onClick={canCollapse ? onToggleExpand : undefined}
				sx={{ display: "flex", alignItems: "flex-start", gap: 2, cursor: canCollapse ? "pointer" : "default" }}
			>
				<SenderAvatar email={email} isDraft={isDraft} isSelf={isSelf} />
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, minWidth: 0, flexWrap: "wrap" }}>
						{isDraft ? (
							<Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
								{name}
							</Typography>
						) : (
							<SenderCard address={email.sender} name={senderName(email)}>
								<Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
									{name}
								</Typography>
							</SenderCard>
						)}
						{!isDraft && name !== email.sender && (
							<Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0, display: "none", [WIDE]: { display: "block" } }}>
								&lt;{email.sender}&gt;
							</Typography>
						)}
						{isDraft && <Chip label="Not sent" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
					</Box>
					<RecipientsLine email={email} mailboxEmail={mailboxEmail} />
				</Box>
				<Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
					<Tooltip title={formatDetailDate(email.date)}>
						<Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, whiteSpace: "nowrap" }}>
							{messageDate(email.date)}
							<Box component="span" sx={{ display: "none", [WIDE]: { display: "inline" } }}>{ago ? ` (${ago})` : ""}</Box>
						</Typography>
					</Tooltip>
					{onToggleStar && !isDraft && (
						<Tooltip title={email.starred ? "Starred" : "Not starred"}>
							<IconButton size="small" onClick={onToggleStar} aria-label={email.starred ? "Unstar" : "Star"} aria-pressed={email.starred}>
								{email.starred ? <StarIcon fontSize="small" sx={{ color: "#f4b400" }} /> : <StarBorderIcon fontSize="small" />}
							</IconButton>
						</Tooltip>
					)}
					{onReply && !isDraft && (
						<Tooltip title="Reply">
							<IconButton size="small" onClick={onReply} aria-label="Reply">
								<ReplyOutlinedIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					)}
					<Tooltip title="More">
						<IconButton size="small" onClick={(e) => setMenu(e.currentTarget)} aria-label="More message actions" aria-haspopup="menu">
							<MoreVertIcon fontSize="small" />
						</IconButton>
					</Tooltip>
					<Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
						{[
							!isDraft && onReply && { key: "reply", icon: <ReplyOutlinedIcon fontSize="small" />, label: "Reply", run: onReply },
							!isDraft && onReplyAll && { key: "replyall", icon: <ReplyAllOutlinedIcon fontSize="small" />, label: "Reply all", run: onReplyAll },
							!isDraft && onForward && { key: "forward", icon: <ForwardOutlinedIcon fontSize="small" />, label: "Forward", run: onForward },
							onViewSource && { key: "source", icon: <CodeIcon fontSize="small" />, label: "Show original", run: onViewSource },
						]
							.filter((x): x is { key: string; icon: React.ReactElement; label: string; run: () => void } => !!x)
							.map((item) => (
								<MenuItem
									key={item.key}
									onClick={() => {
										setMenu(null);
										item.run();
									}}
								>
									<ListItemIcon>{item.icon}</ListItemIcon>
									<ListItemText>{item.label}</ListItemText>
								</MenuItem>
							))}
					</Menu>
				</Box>
			</Box>

			<Box sx={{ ...INDENT, mt: 2 }}>
				<EmailIframe body={inlineBody} autoSize trimQuotes flush />
			</Box>

			{isDraft && (onSendDraft || onEditDraft || onDeleteDraft) && (
				<Box sx={{ display: "flex", gap: 1, mt: 2, ...INDENT }}>
					{onSendDraft && (
						<Button
							variant="contained"
							size="small"
							startIcon={isSending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
							onClick={onSendDraft}
							disabled={isSending}
						>
							{isSending ? "Sending..." : "Send"}
						</Button>
					)}
					{onEditDraft && (
						<Button variant="outlined" size="small" startIcon={<EditOutlinedIcon />} onClick={onEditDraft} disabled={isSending}>
							Edit
						</Button>
					)}
					{onDeleteDraft && (
						<Button size="small" startIcon={<DeleteOutlinedIcon />} onClick={onDeleteDraft} disabled={isSending}>
							Discard
						</Button>
					)}
				</Box>
			)}

			<EmailAttachmentList
				mailboxId={mailboxId}
				emailId={email.id}
				attachments={email.attachments}
				onPreviewImage={onPreviewImage}
				sx={{ mt: 2, ...INDENT }}
			/>
		</Box>
	);
}
