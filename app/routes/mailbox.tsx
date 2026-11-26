// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import { Outlet, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
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
		<Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
			{/* Mobile sidebar overlay backdrop */}
			{isSidebarOpen && (
				<Box
					onClick={closeSidebar}
					role="presentation"
					sx={{
						position: "fixed",
						inset: 0,
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
					inset: { xs: "0 auto 0 0", md: "auto" },
					zIndex: { xs: 40, md: 0 },
					width: { xs: 256, md: "auto" },
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
			<Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, bgcolor: "background.paper" }}>
				<Header />
				<Box component="main" sx={{ flex: 1, overflow: "hidden" }}>
					<Outlet />
				</Box>
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

			<ComposeEmail />
		</Box>
	);
}
