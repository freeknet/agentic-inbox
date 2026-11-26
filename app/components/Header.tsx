// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AutoModeIcon from "@mui/icons-material/AutoMode";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { AppSwitcher } from "~/components/AppSwitcher";
import { useTheme } from "~/hooks/useTheme";
import { useUIStore } from "~/hooks/useUIStore";

export default function Header() {
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchExpanded, setIsSearchExpanded] = useState(false);
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const { toggleSidebar, toggleAgentPanel, isAgentPanelOpen } = useUIStore();
	const { preference: theme, cycle: cycleTheme } = useTheme();
	const themeLabel = theme === "system" ? "Theme: system" : theme === "light" ? "Theme: light" : "Theme: dark";

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
			setIsSearchExpanded(false);
		}
	};

	const clearSearch = () => {
		setSearchQuery("");
		if (location.pathname.includes("/search") && mailboxId) {
			navigate(`/mailbox/${mailboxId}/emails/inbox`);
		}
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Enter") {
			performSearch();
		}
		if (e.key === "Escape") {
			if (searchQuery) {
				clearSearch();
			} else {
				setIsSearchExpanded(false);
			}
		}
	};

	const isSettingsActive = location.pathname.includes("/settings");

	return (
		<Box
			component="header"
			sx={{
				display: "flex",
				alignItems: "center",
				gap: { xs: 1, md: 2 },
				px: { xs: 1.5, md: 2.5 },
				py: 1,
				bgcolor: "background.paper",
				borderBottom: 1,
				borderColor: "divider",
				position: "sticky",
				top: 0,
				zIndex: 10,
			}}
		>
			{/* Hamburger menu - mobile only */}
			<IconButton
				onClick={toggleSidebar}
				aria-label="Toggle sidebar"
				sx={{ display: { xs: "inline-flex", md: "none" }, flexShrink: 0 }}
			>
				<MenuIcon />
			</IconButton>

			{/* Search - full on desktop, collapsible on mobile */}
			<Box
				sx={{
					flex: 1,
					maxWidth: 560,
					display: isSearchExpanded ? "flex" : { xs: "none", md: "flex" },
					alignItems: "center",
					gap: 1,
				}}
			>
				<TextField
					fullWidth
					size="small"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Search emails... (try from:name, is:unread, has:attachment)"
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon fontSize="small" />
								</InputAdornment>
							),
							endAdornment: searchQuery ? (
								<InputAdornment position="end">
									<IconButton size="small" onClick={clearSearch} aria-label="Clear search">
										<CloseIcon fontSize="small" />
									</IconButton>
								</InputAdornment>
							) : undefined,
						},
						htmlInput: { "aria-label": "Search emails" },
					}}
				/>
				<Tooltip title="Search">
					<IconButton onClick={performSearch} aria-label="Search">
						<SearchIcon />
					</IconButton>
				</Tooltip>
			</Box>

			{/* Search toggle button - mobile only, hidden when search is expanded */}
			{!isSearchExpanded && (
				<IconButton
					onClick={() => setIsSearchExpanded(true)}
					aria-label="Search"
					sx={{ display: { xs: "inline-flex", md: "none" }, flexShrink: 0 }}
				>
					<SearchIcon />
				</IconButton>
			)}

			<Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto", flexShrink: 0 }}>
				<AppSwitcher />
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
						{theme === "dark" ? (
							<DarkModeIcon />
						) : theme === "light" ? (
							<LightModeIcon />
						) : (
							<AutoModeIcon />
						)}
					</IconButton>
				</Tooltip>
				<Tooltip title="Settings">
					<IconButton
						onClick={() =>
							navigate(
								isSettingsActive
									? `/mailbox/${mailboxId}/emails/inbox`
									: `/mailbox/${mailboxId}/settings`,
							)
						}
						aria-label="Settings"
						color={isSettingsActive ? "primary" : "default"}
					>
						<SettingsOutlinedIcon />
					</IconButton>
				</Tooltip>
			</Box>
		</Box>
	);
}
