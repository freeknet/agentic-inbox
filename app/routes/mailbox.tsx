import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import { Outlet, useMatches, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
import Sidebar from "~/components/Sidebar";
import { useMailbox } from "~/queries/mailboxes";
import { useFolders } from "~/queries/folders";
import { setAppBadge } from "~/shell/pwa";
import { usePushSync } from "~/lib/push";
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

	// The installed app's icon shows the inbox's unread count.
	const { data: folders } = useFolders(mailboxId);
	const inboxUnread = folders?.find((f) => f.id === "inbox")?.unreadCount;
	useEffect(() => {
		if (inboxUnread !== undefined) setAppBadge(inboxUnread);
	}, [inboxUnread]);
	usePushSync(mailboxId);

	const card = { bgcolor: "background.paper", borderRadius: { md: 4 }, overflow: "hidden" } as const;
	// The email list and search results lay out their own cards (MailboxSplitView).
	const ownCards = useMatches().some((m) => m.id === "routes/email-list" || m.id === "routes/search-results");

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", bgcolor: "background.default" }}>
			<Header />
			<Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
				<Sidebar />
				<Box component="main" sx={{ flex: 1, minWidth: 0, display: "flex", gap: 2, pr: { md: 2 }, pb: { md: 2 } }}>
					<Box sx={{ ...(ownCards ? {} : card), flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
						<Outlet />
					</Box>
					{isAgentPanelOpen && (
						<Box sx={{ ...card, display: { xs: "none", lg: "flex" }, width: 340, flexShrink: 0, flexDirection: "column" }}>
							<AgentSidebar />
						</Box>
					)}
				</Box>
			</Box>
			<ComposeEmail />
		</Box>
	);
}
