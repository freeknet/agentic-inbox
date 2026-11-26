// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import { Outlet, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header, { HEADER_HEIGHT } from "~/components/Header";
import Sidebar from "~/components/Sidebar";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

export default function MailboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);
	const prevMailboxIdRef = useRef<string | undefined>(undefined);
	const { isSidebarOpen, closeSidebar, isAgentPanelOpen, closePanel, closeComposeModal } = useUIStore();

	useEffect(() => {
		if (prevMailboxIdRef.current && mailboxId && prevMailboxIdRef.current !== mailboxId) {
			closePanel();
			closeComposeModal();
			closeSidebar();
		}

		prevMailboxIdRef.current = mailboxId;
	}, [mailboxId, closeComposeModal, closePanel, closeSidebar]);

	return (
		// Same shell as Drive: a full-width header, then sidebar + content below it.
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				height: "100dvh",
				overflow: "hidden",
				bgcolor: "background.default",
			}}
		>
			<Header />

			<Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
				{/* Mobile sidebar overlay backdrop, below the header */}
				{isSidebarOpen && (
					<Box
						onClick={closeSidebar}
						role="presentation"
						sx={{
							position: "fixed",
							inset: `${HEADER_HEIGHT}px 0 0 0`,
							zIndex: 30,
							bgcolor: "rgba(0,0,0,0.3)",
							display: { xs: "block", md: "none" },
						}}
					/>
				)}

				{/* Sidebar: hidden on mobile by default, shown as overlay when open */}
				<Box
					sx={{
						position: { xs: "fixed", md: "relative" },
						top: { xs: `${HEADER_HEIGHT}px`, md: "auto" },
						bottom: { xs: 0, md: "auto" },
						left: 0,
						zIndex: { xs: 40, md: 0 },
						width: { xs: 256, md: "auto" },
						flexShrink: 0,
						transform: {
							xs: isSidebarOpen ? "translateX(0)" : "translateX(-100%)",
							md: "none",
						},
						transition: "transform 200ms ease-in-out",
					}}
				>
					<Sidebar />
				</Box>

				{/* Main content */}
				<Box
					component="main"
					sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, bgcolor: "background.paper" }}
				>
					<Outlet />
				</Box>

				{/* Agent + MCP sidebar -- togglable on desktop */}
				{isAgentPanelOpen && (
					<Box
						sx={{
							display: { xs: "none", lg: "flex" },
							width: 380,
							flexShrink: 0,
							borderLeft: 1,
							borderColor: "divider",
							flexDirection: "column",
							bgcolor: "background.paper",
							overflow: "hidden",
						}}
					>
						<AgentSidebar />
					</Box>
				)}
			</Box>

			<ComposeEmail />
		</Box>
	);
}
