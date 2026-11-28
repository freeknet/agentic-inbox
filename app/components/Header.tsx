import RefreshIcon from "@mui/icons-material/Refresh";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { useDrive } from "~/queries/drive";
import { queryKeys } from "~/queries/keys";
import { AppHeader } from "~/shell/AppHeader";
import { toggleSidebar as toggleShellSidebar } from "~/shell/layout";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import Button from "@mui/material/Button";
import { AccountMenu } from "~/shell/AccountMenu";
import { useRecentSearches } from "~/shell/SearchSuggestions";
import MarkEmailUnreadOutlinedIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";

/** Mail's top bar: the shared shell header with Mail's refresh and agent buttons. */
export default function Header() {
	const [searchQuery, setSearchQuery] = useState("");
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const { toggleSidebar, toggleAgentPanel, isAgentPanelOpen } = useUIStore();
	const queryClient = useQueryClient();
	const drive = useDrive();
	const recent = useRecentSearches("mail-recent-searches");

	const isRefreshing =
		useIsFetching({
			predicate: (query) => ["emails", "folders", "mailboxes", "search"].includes(String(query.queryKey[0])),
		}) > 0;

	/** Reload the list, folder counts and the open thread without a page reload. */
	const refreshMailbox = () => {
		if (!mailboxId) {
			void queryClient.invalidateQueries();
			return;
		}
		void queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
		void queryClient.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) });
		void queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.detail(mailboxId) });
		void queryClient.invalidateQueries({ queryKey: ["search", mailboxId] });
	};

	// Keep the box filled with the current search.
	const urlQuery = searchParams.get("q") || "";
	useEffect(() => {
		if (location.pathname.includes("/search") && urlQuery) setSearchQuery(urlQuery);
	}, [urlQuery, location.pathname]);

	const isSettingsActive = location.pathname.includes("/settings");
	const inbox = mailboxId ? `/mailbox/${mailboxId}/emails/inbox` : "/";

	return (
		<AppHeader
			app="mail"
			homeHref={inbox}
			appUrls={{ drive: drive?.url }}
			search={{
				placeholder: "Search mail",
				value: searchQuery,
				onChange: setSearchQuery,
				onSubmit: () => {
					if (!mailboxId || !searchQuery.trim()) return;
					recent.add(searchQuery);
					navigate(`/mailbox/${mailboxId}/search?q=${encodeURIComponent(searchQuery.trim())}`);
				},
				recent: recent.items,
				onRemoveRecent: recent.remove,
				onPick: (q) => {
					if (!mailboxId) return;
					setSearchQuery(q);
					recent.add(q);
					navigate(`/mailbox/${mailboxId}/search?q=${encodeURIComponent(q)}`);
				},
				tips: [
					{ label: "Unread", insert: "is:unread", icon: <MarkEmailUnreadOutlinedIcon />, color: "#4285f4" },
					{ label: "Starred", insert: "is:starred", icon: <StarBorderIcon />, color: "#fbbc04" },
					{ label: "Has attachment", insert: "has:attachment", icon: <AttachFileIcon />, color: "#fa7b17" },
					{ label: "Sent", insert: "in:sent", icon: <SendOutlinedIcon />, color: "#34a853" },
					{ label: "From…", insert: "from:", icon: <PersonOutlineIcon />, color: "#a142f4" },
				],
				onClear: () => {
					setSearchQuery("");
					if (location.pathname.includes("/search") && mailboxId) navigate(inbox);
				},
			}}
			actions={
				<>
					<Tooltip title={isRefreshing ? "Refreshing…" : "Refresh"}>
						<span>
							<IconButton onClick={refreshMailbox} aria-label="Refresh" disabled={isRefreshing}>
								<RefreshIcon
									sx={{
										animation: isRefreshing ? "spin 1s linear infinite" : "none",
										"@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
									}}
								/>
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title={isAgentPanelOpen ? "Hide agent panel" : "Show agent panel"}>
						<IconButton
							onClick={toggleAgentPanel}
							aria-label="Toggle agent panel"
							color={isAgentPanelOpen ? "primary" : "default"}
							sx={{ display: { xs: "none", lg: "inline-flex" } }}
						>
							<SmartToyOutlinedIcon />
						</IconButton>
					</Tooltip>
				</>
			}
			settings={{
				active: isSettingsActive,
				onClick: () => navigate(isSettingsActive ? inbox : `/mailbox/${mailboxId}/settings`),
			}}
			account={
				<AccountMenu fallback={{ name: null, email: mailboxId ?? null }}>
					<Button
						fullWidth
						color="inherit"
						startIcon={<SwapHorizIcon />}
						onClick={() => navigate("/")}
						sx={{ justifyContent: "flex-start", px: 2.5, py: 1.5, borderRadius: 0 }}
					>
						Switch mailbox
					</Button>
				</AccountMenu>
			}
			onMenuClick={() => toggleShellSidebar(toggleSidebar)}
		/>
	);
}
