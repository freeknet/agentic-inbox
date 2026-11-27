import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import { Outlet, useMatches, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
import MailShortcuts from "~/components/MailShortcuts";
import Sidebar from "~/components/Sidebar";
import { useMailbox } from "~/queries/mailboxes";
import { useFolders } from "~/queries/folders";
import { setAppBadge } from "~/shell/pwa";
import { usePushSync } from "~/lib/push";
import { DEFAULT_PREFS, usePrefs } from "~/lib/prefs";
import { ResizeHandle } from "~/shell/Resizer";
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
	const agentWidth = usePrefs((p) => p.agentWidth);
	const setPref = usePrefs((p) => p.set);

	const card = { bgcolor: "background.paper", borderRadius: { md: 4 }, overflow: "hidden" } as const;
	// The email list and search results lay out their own cards (MailboxSplitView).
	const ownCards = useMatches().some((m) => m.id === "routes/email-list" || m.id === "routes/search-results");

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", bgcolor: "background.default" }}>
			<Header />
			<Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
				<Sidebar />
				<Box component="main" sx={{ flex: 1, minWidth: 0, display: "flex", pr: { md: 2 }, pb: { md: 2 } }}>
					<Box sx={{ ...(ownCards ? {} : card), flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
						<Outlet />
					</Box>
					{isAgentPanelOpen && (
						<Box sx={{ display: { xs: "none", lg: "flex" } }}>
							{/* Dragging left widens the panel, so the handle works on the negative width. */}
							<ResizeHandle
								axis="x"
								label="Resize agent panel"
								value={-agentWidth}
								min={-720}
								max={-280}
								onChange={(v) => setPref("agentWidth", -v)}
								onReset={() => setPref("agentWidth", DEFAULT_PREFS.agentWidth)}
							/>
						</Box>
					)}
					{isAgentPanelOpen && (
						<Box sx={{ ...card, display: { xs: "none", lg: "flex" }, width: agentWidth, flexShrink: 0, flexDirection: "column" }}>
							<AgentSidebar />
						</Box>
					)}
				</Box>
			</Box>
			<ComposeEmail />
			<MailShortcuts />
		</Box>
	);
}
