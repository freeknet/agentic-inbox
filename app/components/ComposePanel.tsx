// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import CloseIcon from "@mui/icons-material/Close";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendIcon from "@mui/icons-material/Send";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useParams } from "react-router";
import { useComposeForm } from "~/hooks/useComposeForm";
import RichTextEditor from "./RichTextEditor";
import { AttachButton, AttachmentChips, FromDriveButton, useFileDrop } from "./ComposeAttachments";
import ScheduleSendButton from "./ScheduleSendButton";
import { RecipientField } from "~/components/RecipientField";

export default function ComposePanel() {
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();

	const {
		to,
		setTo,
		cc,
		setCc,
		bcc,
		setBcc,
		showCcBcc,
		setShowCcBcc,
		subject,
		setSubject,
		body,
		setBody,
		error,
		isSavingDraft,
		isSending,
		formTitle,
		handleSaveDraft,
		handleSend,
		discardCompose,
		closePanel,
		attachments,
	} = useComposeForm(mailboxId, folder);
	const { dragging, dropProps } = useFileDrop(attachments);

	const fieldRow = (label: string, node: React.ReactNode) => (
		<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
			<Typography variant="body2" sx={{ width: 56, flexShrink: 0, fontWeight: 500, color: "text.secondary" }}>
				{label}
			</Typography>
			<Box sx={{ flex: 1, minWidth: 0 }}>{node}</Box>
		</Box>
	);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.paper", containerType: "inline-size", containerName: "compose" }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					px: { xs: 2, md: 3.5 },
					pt: 1.5,
					pb: 0.5,
					minHeight: 64,
					flexShrink: 0,
				}}
			>
				<Typography component="h2" sx={{ fontSize: 22 }}>
					{formTitle}
				</Typography>
				<IconButton size="small" onClick={discardCompose} disabled={isSending} aria-label="Close compose">
					<CloseIcon fontSize="small" />
				</IconButton>
			</Box>

			<Box
				component="form"
				onSubmit={(e) => handleSend(e, closePanel)}
				sx={{
					display: "flex",
					flexDirection: "column",
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					outline: dragging ? "2px dashed" : "none",
					outlineColor: "primary.main",
					outlineOffset: -4,
				}}
				{...dropProps}
			>
				<Box sx={{ p: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", gap: 2 }}>
					{error && <Alert severity="error">{error}</Alert>}

					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						{fieldRow(
							"To",
							<Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
								<RecipientField mailboxId={mailboxId} label="To" value={to} onChange={setTo} placeholder="recipient@example.com" />
								{!showCcBcc && (
									<Button size="small" onClick={() => setShowCcBcc(true)} sx={{ flexShrink: 0, fontSize: 12 }}>
										CC / BCC
									</Button>
								)}
							</Box>,
						)}

						{showCcBcc &&
							fieldRow(
								"CC",
								<RecipientField mailboxId={mailboxId} label="Cc" value={cc} onChange={setCc} />,
							)}

						{showCcBcc &&
							fieldRow(
								"BCC",
								<RecipientField mailboxId={mailboxId} label="Bcc" value={bcc} onChange={setBcc} />,
							)}

						{fieldRow(
							"Subject",
							<TextField
								fullWidth
								size="small"
								placeholder="Email subject"
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
								required
							/>,
						)}
					</Box>

					<Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
						<RichTextEditor value={body} onChange={setBody} />
					</Box>
					<AttachmentChips attachments={attachments} />
				</Box>

				{/* Footer actions */}
				<Box
					sx={{
						mt: "auto",
						px: { xs: 2, md: 3 },
						py: 1.5,
						borderTop: 1,
						borderColor: "divider",
						bgcolor: "action.hover",
						flexShrink: 0,
					}}
				>
					<Box sx={{ display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
						<Button type="button" size="small" onClick={discardCompose} disabled={isSending} aria-label="Discard" sx={{ minWidth: 0 }}>
							<Box component="span" sx={{ display: "none", ["@container compose (min-width: 560px)"]: { display: "inline" } }}>
								Discard
							</Box>
							<DeleteOutlinedIcon fontSize="small" sx={{ display: "block", ["@container compose (min-width: 560px)"]: { display: "none" } }} />
						</Button>
						{/* Phones: one row, icons only for attach, Drive and save. */}
						<Box
							sx={{
								display: "flex",
								flexWrap: "nowrap",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: 1,
								"& .MuiButton-outlined, & .MuiButton-text": {
									// Narrow compose (phones, or beside the agent panel): icons only.
									fontSize: 0,
									minWidth: 0,
									px: 1,
									"& .MuiButton-startIcon": { mr: 0, ml: 0 },
									["@container compose (min-width: 560px)"]: { fontSize: "0.8125rem", px: 1.25, "& .MuiButton-startIcon": { mr: 1, ml: -0.5 } },
								},
							}}
						>
							<AttachButton attachments={attachments} disabled={isSending} />
							<FromDriveButton attachments={attachments} disabled={isSending} />
							<Button
								type="button"
								variant="outlined"
								size="small"
								disabled={isSending || isSavingDraft}
								startIcon={isSavingDraft ? <CircularProgress size={14} /> : <SaveOutlinedIcon />}
								onClick={handleSaveDraft}
							>
								{isSavingDraft ? "Saving..." : "Save as Draft"}
							</Button>
							<ScheduleSendButton
								disabled={isSavingDraft || isSending}
								onSchedule={(at) => handleSend(null, closePanel, at)}
							/>
							<Button
								type="submit"
								variant="contained"
								size="small"
								disabled={isSavingDraft || isSending}
								startIcon={isSending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
							>
								{isSending ? "Sending..." : "Send"}
							</Button>
						</Box>
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
