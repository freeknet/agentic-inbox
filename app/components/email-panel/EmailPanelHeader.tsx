// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface EmailPanelHeaderProps {
	subject: string;
	messageCount: number;
	showThreadCount: boolean;
}

export default function EmailPanelHeader({
	subject,
	messageCount,
	showThreadCount,
}: EmailPanelHeaderProps) {
	return (
		<Box sx={{ px: { xs: 2, md: 3.5 }, pb: 1.5, flexShrink: 0 }}>
			<Typography component="h2" sx={{ fontSize: 22 }}>
				{subject}
			</Typography>
			{showThreadCount && (
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
					{messageCount} messages in this thread
				</Typography>
			)}
		</Box>
	);
}
