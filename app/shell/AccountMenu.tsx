// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import SwitchAccountOutlinedIcon from "@mui/icons-material/SwitchAccountOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useColorScheme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { type ReactNode, useEffect, useState } from "react";
import { useInstallPrompt } from "./pwa";

export interface Identity {
	name: string | null;
	email: string | null;
}

let cached: Promise<Identity> | null = null;

/**
 * Who is signed in, from Cloudflare Access (`/cdn-cgi/access/get-identity`).
 * Local dev has no Access, so it falls back to nothing.
 */
export function useIdentity(): Identity | null {
	const [identity, setIdentity] = useState<Identity | null>(null);
	useEffect(() => {
		cached ??= fetch("/cdn-cgi/access/get-identity", { credentials: "include" })
			.then(async (r) => {
				if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) throw new Error("no identity");
				const j = (await r.json()) as { name?: string; email?: string };
				return { name: j.name || null, email: j.email || null };
			})
			.catch(() => ({ name: null, email: null }));
		let live = true;
		void cached.then((v) => live && setIdentity(v));
		return () => {
			live = false;
		};
	}, []);
	return identity;
}

const COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#9334e6", "#007b83"];
function colorFor(s: string) {
	let h = 0;
	for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return COLORS[h % COLORS.length];
}

function initials(name: string | null, email: string | null): ReactNode {
	const src = name?.trim() || email?.split("@")[0];
	if (!src) return <PersonOutlineIcon fontSize="inherit" />;
	const parts = src.split(/\s+/).filter(Boolean);
	return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src[0]).toUpperCase();
}

/** Ends the Access session for every app (Access has no per-app sign-out). */
export function signOut(returnTo?: string) {
	const q = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
	window.location.href = `/cdn-cgi/access/logout${q}`;
}

/**
 * The account button at the far right of the header, as in Google's apps:
 * who you are, then sign out or switch account. `fallback` fills in when
 * Access can't say (local dev). `children` adds app-specific rows.
 */
export function AccountMenu({ fallback, children }: { fallback?: Identity; children?: ReactNode }) {
	const fromAccess = useIdentity();
	const id: Identity = { name: fromAccess?.name ?? fallback?.name ?? null, email: fromAccess?.email ?? fallback?.email ?? null };
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const label = id.name || id.email || "Account";
	const color = colorFor(id.email || label);
	const first = id.name?.split(/\s+/)[0];
	const { mode, setMode } = useColorScheme();
	const install = useInstallPrompt();

	return (
		<>
			<Tooltip
				title={
					<Box>
						<div>Account</div>
						{id.name && <div>{id.name}</div>}
						{id.email && <div>{id.email}</div>}
					</Box>
				}
			>
				<IconButton aria-label={`Account: ${label}`} aria-haspopup="dialog" onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
					<Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: color }}>{initials(id.name, id.email)}</Avatar>
				</IconButton>
			</Tooltip>
			<Popover
				open={!!anchor}
				anchorEl={anchor}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
				transformOrigin={{ vertical: "top", horizontal: "right" }}
				slotProps={{ paper: { sx: { width: 340, maxWidth: "calc(100vw - 32px)", borderRadius: 7, p: 1.5, bgcolor: "background.default" } } }}
			>
				<Stack sx={{ alignItems: "center", textAlign: "center", pt: 1.5, pb: 2, px: 2 }}>
					{id.email && (
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							{id.email}
						</Typography>
					)}
					<Avatar sx={{ width: 72, height: 72, fontSize: 30, bgcolor: color, mb: 1.5 }}>{initials(id.name, id.email)}</Avatar>
					<Typography variant="h6" sx={{ fontWeight: 400 }}>
						{first ? `Hi, ${first}!` : "Signed in"}
					</Typography>
					<Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.75, color: "text.secondary" }}>
						<VerifiedUserOutlinedIcon sx={{ fontSize: 16 }} />
						<Typography variant="caption">Protected by Cloudflare Access</Typography>
					</Stack>
				</Stack>
				{/* Theme (the header's toggle is hidden on phones) and install. */}
				<Box sx={{ bgcolor: "background.paper", borderRadius: 4, mb: 1, px: 2, py: 1.5 }}>
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
						Theme
					</Typography>
					<ToggleButtonGroup exclusive fullWidth size="small" value={mode ?? "system"} onChange={(_, v) => v && setMode(v)} aria-label="Theme">
						<ToggleButton value="system" aria-label="System theme">
							<BrightnessAutoIcon fontSize="small" sx={{ mr: 0.75 }} />
							Auto
						</ToggleButton>
						<ToggleButton value="light" aria-label="Light theme">
							<LightModeOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />
							Light
						</ToggleButton>
						<ToggleButton value="dark" aria-label="Dark theme">
							<DarkModeOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />
							Dark
						</ToggleButton>
					</ToggleButtonGroup>
					{install && (
						<Button fullWidth variant="outlined" startIcon={<InstallDesktopOutlinedIcon />} onClick={() => void install()} sx={{ mt: 1.5 }}>
							Install the app
						</Button>
					)}
				</Box>
				{children && (
					<Box sx={{ bgcolor: "background.paper", borderRadius: 4, mb: 1, overflow: "hidden" }}>
						{children}
					</Box>
				)}
				<Box sx={{ bgcolor: "background.paper", borderRadius: 4, overflow: "hidden" }}>
					<Button
						fullWidth
						color="inherit"
						startIcon={<SwitchAccountOutlinedIcon />}
						onClick={() => signOut(window.location.origin + "/")}
						sx={{ justifyContent: "flex-start", px: 2.5, py: 1.5, borderRadius: 0 }}
					>
						Switch account
					</Button>
					<Divider />
					<Button
						fullWidth
						color="inherit"
						startIcon={<LogoutIcon />}
						onClick={() => signOut()}
						sx={{ justifyContent: "flex-start", px: 2.5, py: 1.5, borderRadius: 0 }}
					>
						Sign out of all apps
					</Button>
				</Box>
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 1.5, px: 2 }}>
					Signing out ends your session in Mail and Drive. Switching signs out and back in, so you can pick a different Google account.
				</Typography>
			</Popover>
		</>
	);
}
