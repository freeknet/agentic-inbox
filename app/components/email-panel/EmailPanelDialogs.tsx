// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { downloadFile } from "~/lib/utils";
import type { Email } from "~/types";

interface PreviewImage {
	url: string;
	filename: string;
}

interface EmailPanelDialogsProps {
	sourceViewEmail: Email | null;
	previewImage: PreviewImage | null;
	onCloseSource: () => void;
	onClosePreview: () => void;
}

function getSourceHeaders(msg: Email): { key: string; value: string }[] {
	if (msg.raw_headers) {
		try {
			const parsed = JSON.parse(msg.raw_headers);
			if (Array.isArray(parsed)) {
				return parsed.map((header) => ({
					key: header.key || header.name || "",
					value: String(header.value || ""),
				}));
			}
			if (typeof parsed === "object" && parsed !== null) {
				return Object.entries(parsed).map(([key, value]) => ({
					key,
					value: String(value),
				}));
			}
		} catch {
			// Fall through to field-based headers.
		}
	}

	const headers: { key: string; value: string }[] = [];
	if (msg.sender) headers.push({ key: "From", value: msg.sender });
	if (msg.recipient) headers.push({ key: "To", value: msg.recipient });
	if (msg.cc) headers.push({ key: "Cc", value: msg.cc });
	if (msg.bcc) headers.push({ key: "Bcc", value: msg.bcc });
	if (msg.subject) headers.push({ key: "Subject", value: msg.subject });
	if (msg.date) headers.push({ key: "Date", value: msg.date });
	if (msg.message_id) headers.push({ key: "Message-ID", value: msg.message_id });
	if (msg.in_reply_to) headers.push({ key: "In-Reply-To", value: msg.in_reply_to });
	if (msg.email_references) {
		headers.push({ key: "References", value: msg.email_references });
	}
	if (msg.thread_id) headers.push({ key: "X-Thread-ID", value: msg.thread_id });
	return headers;
}

export default function EmailPanelDialogs({
	sourceViewEmail,
	previewImage,
	onCloseSource,
	onClosePreview,
}: EmailPanelDialogsProps) {
	const sourceHeaders = sourceViewEmail ? getSourceHeaders(sourceViewEmail) : [];

	return (
		<>
			<Dialog open={sourceViewEmail !== null} onClose={onCloseSource} fullWidth maxWidth="md">
				<DialogTitle>
					Email Source Headers
					{sourceViewEmail && (
						<Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
							{sourceViewEmail.subject}
						</Typography>
					)}
				</DialogTitle>
				<DialogContent>
					{sourceViewEmail && (
						<Box sx={{ maxHeight: "60vh", overflowY: "auto" }}>
							<Box component="table" sx={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
								<Box component="tbody">
									{sourceHeaders.map((header, idx) => (
										<Box
											component="tr"
											key={`${header.key}-${idx}`}
											sx={{ bgcolor: idx % 2 === 0 ? "action.hover" : "transparent" }}
										>
											<Box
												component="td"
												sx={{
													py: 0.75,
													px: 1.5,
													fontFamily: "monospace",
													fontWeight: 600,
													whiteSpace: "nowrap",
													verticalAlign: "top",
													width: 160,
												}}
											>
												{header.key}
											</Box>
											<Box
												component="td"
												sx={{
													py: 0.75,
													px: 1.5,
													fontFamily: "monospace",
													color: "text.secondary",
													wordBreak: "break-all",
												}}
											>
												{header.value}
											</Box>
										</Box>
									))}
								</Box>
							</Box>
							{sourceHeaders.length === 0 && (
								<Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
									No header data available for this email.
								</Typography>
							)}
						</Box>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={onCloseSource}>Close</Button>
				</DialogActions>
			</Dialog>

			<Dialog open={previewImage !== null} onClose={onClosePreview} fullWidth maxWidth="md">
				<DialogTitle>{previewImage?.filename}</DialogTitle>
				<DialogContent>
					{previewImage && (
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								bgcolor: "action.hover",
								borderRadius: 2,
								p: 2,
								minHeight: 200,
							}}
						>
							<Box
								component="img"
								src={previewImage.url}
								alt={previewImage.filename}
								sx={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 1 }}
							/>
						</Box>
					)}
				</DialogContent>
				<DialogActions sx={{ justifyContent: "space-between" }}>
					<Button
						variant="outlined"
						size="small"
						onClick={() => {
							if (previewImage) {
								downloadFile(previewImage.url, previewImage.filename);
							}
						}}
					>
						Download Original
					</Button>
					<Button variant="contained" size="small" onClick={onClosePreview}>
						Close
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
