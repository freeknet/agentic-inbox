import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import { Outlet, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
import Sidebar from "~/components/Sidebar";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

/**
 * The same shell as Drive (app/shell/): a full-width header, the sidebar
 * column (a drawer on phones), and the content on a rounded card.
 */
export default function MailboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);
	const prevMailboxIdRef = useRef<string | undefined>(undefined);
	const { closeSidebar, isAgentPanelOpen, closePanel, closeComposeModal } = useUIStore();

	useEffect(() => {
		if (prevMailboxIdRef.current && mailboxId && prevMailboxIdRef.current !== mailboxId) {
			closePanel();
			closeComposeModal();
			closeSidebar();
		}
		prevMailboxIdRef.current = mailboxId;
	}, [mailboxId, closeComposeModal, closePanel, closeSidebar]);

	const card = { bgcolor: "background.paper", borderRadius: { md: 4 }, overflow: "hidden" } as const;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", bgcolor: "background.default" }}>
			<Header />
			<Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
				<Sidebar />
				<Box component="main" sx={{ flex: 1, minWidth: 0, display: "flex", gap: 2, pr: { md: 2 }, pb: { md: 2 } }}>
					<Box sx={{ ...card, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
						<Outlet />
					</Box>
					{isAgentPanelOpen && (
						<Box sx={{ ...card, display: { xs: "none", lg: "flex" }, width: 380, flexShrink: 0, flexDirection: "column" }}>
							<AgentSidebar />
						</Box>
					)}
				</Box>
			</Box>
			<ComposeEmail />
		</Box>
	);
}
