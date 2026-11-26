// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import { formatDetailDate } from "~/lib/utils";
import { useInlineImages } from "~/hooks/useInlineImages";
import type { Email } from "~/types";

interface SingleMessageViewProps {
	email: Email;
	mailboxId?: string;
	onPreviewImage: (url: string, filename: string) => void;
}

export default function SingleMessageView({
	email,
	mailboxId,
	onPreviewImage,
}: SingleMessageViewProps) {
	const inlineBody = useInlineImages(email.body || "", mailboxId, email.id, email.attachments);
	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<Box sx={{ px: { xs: 2, md: 3 }, py: 2, borderBottom: 1, borderColor: "divider" }}>
				<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
						<Avatar sx={{ width: 36, height: 36, fontSize: 12, fontWeight: 700, bgcolor: "action.selected", color: "text.primary" }}>
							{email.sender.charAt(0).toUpperCase()}
						</Avatar>
						<Box sx={{ minWidth: 0 }}>
							<Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
								{email.sender}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								To: {email.recipient}
							</Typography>
						</Box>
					</Box>
					<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
						{formatDetailDate(email.date)}
					</Typography>
				</Box>
			</Box>

			<Box sx={{ flex: 1, minHeight: 0 }}>
				<EmailIframe body={inlineBody} />
			</Box>

			<EmailAttachmentList
				mailboxId={mailboxId}
				emailId={email.id}
				attachments={email.attachments}
				onPreviewImage={onPreviewImage}
				sx={{ px: { xs: 2, md: 3 }, py: 1.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}
				showHeading
			/>
		</Box>
	);
}
