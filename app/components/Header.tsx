// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AutoModeIcon from "@mui/icons-material/AutoMode";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { AppSwitcher } from "~/components/AppSwitcher";
import { useTheme } from "~/hooks/useTheme";
import { useUIStore } from "~/hooks/useUIStore";
import { queryKeys } from "~/queries/keys";

/** Matches Drive's shell: brand, pill search, then the action icons. */
const BRAND_WIDTH = 240;
export const HEADER_HEIGHT = 64;

export default function Header() {
	const [searchQuery, setSearchQuery] = useState("");
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const { toggleSidebar, toggleAgentPanel, isAgentPanelOpen } = useUIStore();
	const { preference: theme, cycle: cycleTheme } = useTheme();
	const queryClient = useQueryClient();
	const themeLabel = theme === "system" ? "Theme: system" : theme === "light" ? "Theme: light" : "Theme: dark";

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

	// Sync search input with URL query param so it stays populated
	const urlQuery = searchParams.get("q") || "";
	useEffect(() => {
		if (location.pathname.includes("/search") && urlQuery) {
			setSearchQuery(urlQuery);
		}
	}, [urlQuery, location.pathname]);

	const performSearch = () => {
		if (mailboxId && searchQuery.trim()) {
			const q = searchQuery.trim();
			navigate(`/mailbox/${mailboxId}/search?q=${encodeURIComponent(q)}`);
		}
	};

	const clearSearch = () => {
		setSearchQuery("");
		if (location.pathname.includes("/search") && mailboxId) {
			navigate(`/mailbox/${mailboxId}/emails/inbox`);
		}
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Enter") performSearch();
		if (e.key === "Escape" && searchQuery) clearSearch();
	};

	const isSettingsActive = location.pathname.includes("/settings");

	return (
		<Stack
			component="header"
			direction="row"
			spacing={1}
			sx={{
				alignItems: "center",
				px: { xs: 1, sm: 2 },
				py: 1,
				height: HEADER_HEIGHT,
				flexShrink: 0,
				bgcolor: "background.default",
				borderBottom: 1,
				borderColor: "divider",
			}}
		>
			<IconButton aria-label="Toggle sidebar" onClick={toggleSidebar} sx={{ display: { md: "none" } }}>
				<MenuIcon />
			</IconButton>

			<Stack
				component={NavLink}
				to={mailboxId ? `/mailbox/${mailboxId}/emails/inbox` : "/"}
				direction="row"
				spacing={1}
				sx={{
					alignItems: "center",
					textDecoration: "none",
					color: "text.primary",
					width: { md: BRAND_WIDTH },
					flexShrink: 0,
				}}
			>
				<MailOutlinedIcon sx={{ fontSize: 34, color: "primary.main" }} />
				<Typography variant="h6" sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary" }}>
					Mail
				</Typography>
			</Stack>

			<Box component="form" role="search" sx={{ flex: 1, maxWidth: 720, minWidth: 0 }} onSubmit={(e) => e.preventDefault()}>
				<TextField
					fullWidth
					size="small"
					placeholder="Search mail"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					slotProps={{
						htmlInput: { "aria-label": "Search emails" },
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon />
								</InputAdornment>
							),
							endAdornment: searchQuery ? (
								<InputAdornment position="end">
									<IconButton size="small" aria-label="Search" onClick={performSearch}>
										<SearchIcon fontSize="small" />
									</IconButton>
									<IconButton size="small" aria-label="Clear search" onClick={clearSearch}>
										<CloseIcon fontSize="small" />
									</IconButton>
								</InputAdornment>
							) : undefined,
							sx: { borderRadius: 999, bgcolor: "action.hover", "& fieldset": { border: 0 }, height: 48 },
						},
					}}
				/>
			</Box>

			<Box sx={{ flex: { md: 1 } }} />

			<Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
				<Tooltip title={isRefreshing ? "Refreshing…" : "Refresh inbox"}>
					<span>
						<IconButton onClick={refreshMailbox} aria-label="Refresh inbox" disabled={isRefreshing}>
							<RefreshIcon
								sx={{
									animation: isRefreshing ? "spin 1s linear infinite" : "none",
									"@keyframes spin": {
										from: { transform: "rotate(0deg)" },
										to: { transform: "rotate(360deg)" },
									},
								}}
							/>
						</IconButton>
					</span>
				</Tooltip>
				<Tooltip title={isAgentPanelOpen ? "Hide agent panel" : "Show agent panel"}>
					<IconButton
						onClick={toggleAgentPanel}
						aria-label="Toggle agent panel"
						sx={{ display: { xs: "none", lg: "inline-flex" } }}
					>
						<SmartToyOutlinedIcon />
					</IconButton>
				</Tooltip>
				<Tooltip title={`${themeLabel} (click to change)`}>
					<IconButton onClick={cycleTheme} aria-label={`${themeLabel} (click to change)`}>
						{theme === "dark" ? <DarkModeIcon /> : theme === "light" ? <LightModeIcon /> : <AutoModeIcon />}
					</IconButton>
				</Tooltip>
				<Tooltip title="Settings">
					<IconButton
						onClick={() =>
							navigate(
								isSettingsActive ? `/mailbox/${mailboxId}/emails/inbox` : `/mailbox/${mailboxId}/settings`,
							)
						}
						aria-label="Settings"
						color={isSettingsActive ? "primary" : "default"}
					>
						<SettingsOutlinedIcon />
					</IconButton>
				</Tooltip>
				<AppSwitcher />
			</Stack>
		</Stack>
	);
}
