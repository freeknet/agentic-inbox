// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import CodeIcon from "@mui/icons-material/Code";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import SendIcon from "@mui/icons-material/Send";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import { useInlineImages } from "~/hooks/useInlineImages";
import { formatDetailDate, formatShortDate, stripHtml } from "~/lib/utils";
import type { Email } from "~/types";

interface ThreadMessageProps {
	email: Email;
	mailboxId?: string;
	mailboxEmail?: string;
	isLast: boolean;
	isDraft?: boolean;
	isSending?: boolean;
	isExpanded: boolean;
	onToggleExpand: () => void;
	onSendDraft?: () => void;
	onEditDraft?: () => void;
	onDeleteDraft?: () => void;
	onViewSource?: () => void;
	onPreviewImage?: (url: string, filename: string) => void;
}

function SenderAvatar({ isDraft, isSelf, sender }: { isDraft?: boolean; isSelf: boolean; sender: string }) {
	return (
		<Avatar
			sx={{
				width: 32,
				height: 32,
				flexShrink: 0,
				fontSize: 12,
				fontWeight: 700,
				bgcolor: isDraft ? "action.selected" : isSelf ? "primary.main" : "action.selected",
				color: isDraft ? "text.secondary" : isSelf ? "primary.contrastText" : "text.primary",
			}}
		>
			{isDraft ? "D" : sender.charAt(0).toUpperCase()}
		</Avatar>
	);
}

export default function ThreadMessage({
	email,
	mailboxId,
	mailboxEmail,
	isLast,
	isDraft,
	isSending,
	isExpanded,
	onToggleExpand,
	onSendDraft,
	onEditDraft,
	onDeleteDraft,
	onViewSource,
	onPreviewImage,
}: ThreadMessageProps) {
	// Called before the collapsed early return so hook order stays stable.
	const inlineBody = useInlineImages(isExpanded ? email.body || "" : "", mailboxId, email.id, email.attachments);
	const isSelf = email.sender === mailboxEmail;
	const senderLabel = isDraft ? "Draft reply" : isSelf ? "You" : email.sender;
	const borderBottom = isLast ? 0 : 1;
	const draftBorder = isDraft ? { borderLeft: 2, borderColor: "warning.main" } : {};

	if (!isExpanded) {
		return (
			<Box sx={{ borderBottom, borderColor: "divider", ...draftBorder }}>
				<ButtonBase
					onClick={onToggleExpand}
					sx={{
						width: "100%",
						display: "flex",
						alignItems: "center",
						gap: 1.5,
						px: 2,
						py: 1.5,
						textAlign: "left",
						justifyContent: "flex-start",
						"&:hover": { bgcolor: "action.hover" },
					}}
				>
					<SenderAvatar isDraft={isDraft} isSelf={isSelf} sender={email.sender} />
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
							<Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
								{senderLabel}
							</Typography>
							<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
								{formatDetailDate(email.date)}
							</Typography>
						</Box>
						<Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
							{stripHtml(email.body || "").slice(0, 80)}
						</Typography>
					</Box>
					<ExpandMoreIcon sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
				</ButtonBase>
			</Box>
		);
	}

	return (
		<Box sx={{ borderBottom, borderColor: "divider", ...draftBorder }}>
			<Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
				<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, mb: 1.5 }}>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
						<IconButton size="small" onClick={onToggleExpand} aria-label="Collapse message" sx={{ p: 0 }}>
							<SenderAvatar isDraft={isDraft} isSelf={isSelf} sender={email.sender} />
						</IconButton>
						<Box sx={{ minWidth: 0 }}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
								<Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
									{senderLabel}
								</Typography>
								{isDraft && <Chip label="Draft" size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
							</Box>
							<Typography variant="caption" color="text.secondary">
								To: {email.recipient}
							</Typography>
						</Box>
					</Box>
					<Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
						<Typography variant="caption" color="text.secondary">
							{formatShortDate(email.date)}
						</Typography>
						{onViewSource && (
							<Tooltip title="View source">
								<IconButton size="small" onClick={onViewSource} aria-label="View source">
									<CodeIcon sx={{ fontSize: 16 }} />
								</IconButton>
							</Tooltip>
						)}
						<IconButton size="small" onClick={onToggleExpand} aria-label="Collapse message">
							<ExpandLessIcon sx={{ fontSize: 16 }} />
						</IconButton>
					</Box>
				</Box>

				<Box sx={{ ml: { md: "42px" } }}>
					<EmailIframe body={inlineBody} autoSize />
				</Box>

				{isDraft && (onSendDraft || onEditDraft || onDeleteDraft) && (
					<Box sx={{ display: "flex", gap: 1, mt: 1.5, ml: { md: "42px" } }}>
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
							<Button
								variant="outlined"
								size="small"
								startIcon={<EditOutlinedIcon />}
								onClick={onEditDraft}
								disabled={isSending}
							>
								Edit
							</Button>
						)}
						{onDeleteDraft && (
							<Button
								size="small"
								startIcon={<DeleteOutlinedIcon />}
								onClick={onDeleteDraft}
								disabled={isSending}
							>
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
					sx={{ mt: 1.5, ml: { md: "42px" } }}
				/>
			</Box>
		</Box>
	);
}
