// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendIcon from "@mui/icons-material/Send";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useParams } from "react-router";
import { useComposeForm } from "~/hooks/useComposeForm";
import { useUIStore } from "~/hooks/useUIStore";
import RichTextEditor from "./RichTextEditor";
import { AttachButton, AttachmentChips, FromDriveButton, useFileDrop } from "./ComposeAttachments";
import ScheduleSendButton from "./ScheduleSendButton";

export default function ComposeEmail() {
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();

	const { isComposeModalOpen, closeComposeModal } = useUIStore();

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
		attachments,
	} = useComposeForm(mailboxId, folder);
	const { dragging, dropProps } = useFileDrop(attachments);
	const discard = () => {
		attachments.reset({ discard: true });
		closeComposeModal();
	};

	return (
		<Dialog
			open={isComposeModalOpen}
			onClose={() => !isSending && discard()}
			fullWidth
			maxWidth="md"
		>
			<DialogTitle sx={{ fontWeight: 600 }}>{formTitle}</DialogTitle>
			<DialogContent dividers>
				<Box
					component="form"
					onSubmit={(e) => handleSend(e, closeComposeModal)}
					sx={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
						outline: dragging ? "2px dashed" : "none",
						outlineColor: "primary.main",
					}}
					{...dropProps}
				>
					{error && <Alert severity="error">{error}</Alert>}
					<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
						<Box sx={{ flex: 1 }}>
							<TextField
								fullWidth
								label="To"
								size="small"
								placeholder="recipient@example.com, another@example.com"
								value={to}
								onChange={(e) => setTo(e.target.value)}
								required
							/>
						</Box>
						{!showCcBcc && (
							<Button size="small" onClick={() => setShowCcBcc(true)} sx={{ mt: 0.5, fontSize: 12 }}>
								CC / BCC
							</Button>
						)}
					</Box>
					{showCcBcc && (
						<TextField
							fullWidth
							label="CC"
							size="small"
							value={cc}
							onChange={(e) => setCc(e.target.value)}
							placeholder="Separate multiple addresses with commas"
						/>
					)}
					{showCcBcc && (
						<TextField
							fullWidth
							label="BCC"
							size="small"
							value={bcc}
							onChange={(e) => setBcc(e.target.value)}
							placeholder="Separate multiple addresses with commas"
						/>
					)}
					<TextField
						fullWidth
						label="Subject"
						size="small"
						placeholder="Email subject"
						value={subject}
						onChange={(e) => setSubject(e.target.value)}
						required
					/>
					<Box>
						<Typography variant="body2" sx={{ fontWeight: 500, mb: 0.75 }}>
							Message
						</Typography>
						<RichTextEditor value={body} onChange={setBody} />
					</Box>
					<AttachmentChips attachments={attachments} />
					<Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, pt: 1 }}>
						<Button type="button" size="small" onClick={discard} disabled={isSending}>
							Discard
						</Button>
						<Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
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
								onSchedule={(at) => handleSend(null, closeComposeModal, at)}
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
			</DialogContent>
		</Dialog>
	);
}
