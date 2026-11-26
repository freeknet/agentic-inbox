// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import type { ReactNode } from "react";
import ComposePanel from "~/components/ComposePanel";
import EmailPanel from "~/components/EmailPanel";

interface MailboxSplitViewProps {
	selectedEmailId: string | null;
	isComposing: boolean;
	children: ReactNode;
}

export default function MailboxSplitView({
	selectedEmailId,
	isComposing,
	children,
}: MailboxSplitViewProps) {
	const isPanelOpen = selectedEmailId !== null || isComposing;

	return (
		<Box sx={{ display: "flex", height: "100%" }}>
			<Box
				sx={{
					display: isPanelOpen ? { xs: "none", md: "flex" } : "flex",
					flexDirection: "column",
					minWidth: 0,
					flexShrink: 0,
					width: isPanelOpen ? { md: 380 } : "100%",
					borderRight: isPanelOpen ? { md: 1 } : 0,
					borderColor: "divider",
				}}
			>
				{children}
			</Box>
			{isPanelOpen && (
				<Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
					{isComposing && !selectedEmailId ? (
						<ComposePanel />
					) : isComposing && selectedEmailId ? (
						<Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
							<ComposePanel />
							<Divider />
							<EmailPanel emailId={selectedEmailId} />
						</Box>
					) : selectedEmailId ? (
						<EmailPanel emailId={selectedEmailId} />
					) : null}
				</Box>
			)}
		</Box>
	);
}
