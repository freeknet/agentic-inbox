// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { APP_BRANDS, AppsMenu, type AppId } from "./AppsMenu";
import { InstallButton } from "./pwa";

export const HEADER_HEIGHT = 64;
export const SIDEBAR_WIDTH = 256;

function ThemeToggle() {
	const { mode, setMode } = useColorScheme();
	if (!mode) return <Box sx={{ width: 40 }} />;
	const next = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
	const Icon = mode === "dark" ? DarkModeOutlinedIcon : mode === "light" ? LightModeOutlinedIcon : BrightnessAutoIcon;
	return (
		<Tooltip title={`Theme: ${mode} (switch to ${next})`}>
			<IconButton aria-label={`Theme: ${mode}`} onClick={() => setMode(next)}>
				<Icon />
			</IconButton>
		</Tooltip>
	);
}

export interface AppHeaderProps {
	app: AppId;
	/** Where the logo goes. */
	homeHref: string;
	/** URLs of the other apps, for the launcher. */
	appUrls: Partial<Record<AppId, string | null>>;
	/** Omit on pages with nothing to search (the mailbox picker). */
	search?: {
		placeholder: string;
		value: string;
		onChange: (value: string) => void;
		onSubmit: () => void;
		onClear: () => void;
	};
	/** App-specific icon buttons, shown before theme, settings and apps. */
	actions?: ReactNode;
	settings?: { onClick: () => void; active?: boolean };
	/** The menu button: collapses the sidebar on desktop, opens the drawer on phones (see toggleSidebar in ./layout). Omit on pages without a sidebar. */
	onMenuClick?: () => void;
	/** The account button (AccountMenu), last on the right as in Google's apps. */
	account?: ReactNode;
}

/**
 * The top bar of both apps: menu (phones), logo and name, a pill search box,
 * then app actions, install, theme, settings and the apps launcher, always in
 * that order. In an installed desktop window with the title bar hidden
 * (Window Controls Overlay) it doubles as the title bar: it can be dragged,
 * and it keeps clear of the window buttons.
 */
export function AppHeader({ app, homeHref, appUrls, search, actions, settings, account, onMenuClick }: AppHeaderProps) {
	const brand = APP_BRANDS[app];
	return (
		<Stack
			component="header"
			direction="row"
			spacing={1}
			sx={{
				alignItems: "center",
				// Installed on a phone, keep clear of the notch / status bar.
				pt: "calc(8px + env(safe-area-inset-top, 0px))",
				pb: 1,
				height: `calc(${HEADER_HEIGHT}px + env(safe-area-inset-top, 0px))`,
				flexShrink: 0,
				bgcolor: "background.default",
				// Window Controls Overlay: the env() values exist only in that mode.
				pl: "max(var(--header-px), env(titlebar-area-x, 0px))",
				pr: "max(var(--header-px), calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)))",
				"--header-px": { xs: "8px", sm: "16px" },
				WebkitAppRegion: "drag",
				"& a, & button, & input, & form": { WebkitAppRegion: "no-drag" },
			}}
		>
			{onMenuClick && (
				<Tooltip title="Main menu">
					<IconButton aria-label="Main menu" onClick={onMenuClick}>
						<MenuIcon />
					</IconButton>
				</Tooltip>
			)}
			<Stack
				component={RouterLink}
				to={homeHref}
				direction="row"
				spacing={1}
				// On phones the search box gets the room (as in Gmail's app); the logo returns from sm up.
				sx={{ display: { xs: search ? "none" : "flex", sm: "flex" }, alignItems: "center", textDecoration: "none", color: "text.primary", width: { md: SIDEBAR_WIDTH - (onMenuClick ? 64 : 16) }, flexShrink: 0 }}
			>
				{brand.icon(40)}
				<Typography variant="h6" sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary" }}>
					{brand.name}
				</Typography>
			</Stack>
			{search ? (
			<Box
				component="form"
				role="search"
				sx={{ flex: 1, maxWidth: 720, minWidth: 0 }}
				onSubmit={(e) => {
					e.preventDefault();
					search.onSubmit();
				}}
			>
				<TextField
					fullWidth
					size="small"
					placeholder={search.placeholder}
					value={search.value}
					onChange={(e) => search.onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape" && search.value) search.onClear();
					}}
					slotProps={{
						htmlInput: { "aria-label": search.placeholder },
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon />
								</InputAdornment>
							),
							endAdornment: search.value ? (
								<InputAdornment position="end">
									<IconButton size="small" aria-label="Clear search" onClick={search.onClear}>
										<CloseIcon fontSize="small" />
									</IconButton>
								</InputAdornment>
							) : undefined,
							sx: { borderRadius: 3, bgcolor: "action.hover", "& fieldset": { border: 0 }, height: 48, transition: "background-color .15s, box-shadow .15s", "&.Mui-focused": { bgcolor: "background.paper", boxShadow: 2 } },
						},
					}}
				/>
			</Box>
			) : (
				<Box sx={{ flex: 1 }} />
			)}
			<Box sx={{ flex: { md: 1 } }} />
			<Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
				{/* App-specific buttons step aside on phones so the search box keeps its room. */}
				{/* On phones only apps and the account stay; theme, install and settings live in the account menu and sidebar. */}
				<Stack direction="row" spacing={0.5} sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center" }}>
					{actions}
					<InstallButton name={brand.name} />
					<ThemeToggle />
					{settings && (
						<Tooltip title="Settings">
							<IconButton aria-label="Settings" onClick={settings.onClick} color={settings.active ? "primary" : "default"}>
								<SettingsOutlinedIcon />
							</IconButton>
						</Tooltip>
					)}
				</Stack>
				<AppsMenu current={app} urls={appUrls} />
				{account}
			</Stack>
		</Stack>
	);
}
