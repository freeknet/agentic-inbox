// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import AddToDriveIcon from "@mui/icons-material/AddToDrive";
import AppsIcon from "@mui/icons-material/Apps";
import MailIcon from "@mui/icons-material/Mail";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";

export type AppId = "mail" | "drive";

export const APP_BRANDS: Record<AppId, { name: string; icon: (size: number) => React.ReactNode }> = {
	mail: { name: "Mail", icon: (size) => <MailIcon sx={{ fontSize: size, color: "#ea4335" }} /> },
	drive: { name: "Drive", icon: (size) => <AddToDriveIcon sx={{ fontSize: size, color: "#1a73e8" }} /> },
};

/**
 * The apps launcher (3×3 grid button). Both apps sit behind the same
 * Cloudflare Access team, so switching needs no second sign-in. Apps without
 * a URL are left out; with only the current app it renders nothing.
 */
export function AppsMenu({ current, urls }: { current: AppId; urls: Partial<Record<AppId, string | null>> }) {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const apps = (Object.keys(APP_BRANDS) as AppId[]).filter((id) => id === current || urls[id]);
	if (apps.length < 2) return null;
	return (
		<>
			<Tooltip title="Apps">
				<IconButton aria-label="Apps" aria-haspopup="true" aria-expanded={!!anchor} onClick={(e) => setAnchor(e.currentTarget)}>
					<AppsIcon />
				</IconButton>
			</Tooltip>
			<Popover
				open={!!anchor}
				anchorEl={anchor}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
				transformOrigin={{ vertical: "top", horizontal: "right" }}
				slotProps={{ paper: { sx: { borderRadius: 4, p: 1.5, bgcolor: "background.default" } } }}
			>
				<Paper sx={{ p: 1, borderRadius: 3, display: "grid", gridTemplateColumns: "repeat(2, 96px)", gap: 0.5 }}>
					{apps.map((id) => (
						<Stack
							key={id}
							component="a"
							href={id === current ? "/" : (urls[id] ?? "/")}
							aria-current={id === current ? "page" : undefined}
							spacing={0.5}
							sx={{
								alignItems: "center",
								py: 1.5,
								borderRadius: 3,
								textDecoration: "none",
								color: "text.primary",
								bgcolor: id === current ? "action.selected" : undefined,
								"&:hover": { bgcolor: id === current ? "action.selected" : "action.hover" },
							}}
						>
							{APP_BRANDS[id].icon(36)}
							<Typography variant="body2">{APP_BRANDS[id].name}</Typography>
						</Stack>
					))}
				</Paper>
			</Popover>
		</>
	);
}
