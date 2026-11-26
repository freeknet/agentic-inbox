import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useDrive } from "~/queries/drive";

/**
 * Mail | Drive switcher, mirrored in agentic-drive's header. Both apps sit
 * behind the same Cloudflare Access team, so following the link needs no
 * second sign-in. Hidden when Drive isn't connected.
 */
export function AppSwitcher() {
	const drive = useDrive();
	if (!drive) return null;
	return (
		<Box
			component="nav"
			aria-label="Apps"
			sx={{
				display: "flex",
				alignItems: "center",
				border: 1,
				borderColor: "divider",
				borderRadius: 2,
				p: 0.25,
				flexShrink: 0,
			}}
		>
			<Box
				aria-current="page"
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.75,
					px: 1.25,
					py: 0.25,
					borderRadius: 1.5,
					bgcolor: "action.selected",
					color: "text.primary",
				}}
			>
				<MailOutlinedIcon sx={{ fontSize: 16 }} />
				<Typography variant="body2" sx={{ display: { xs: "none", sm: "block" }, fontWeight: 500 }}>
					Mail
				</Typography>
			</Box>
			<Link
				href={drive.url}
				underline="none"
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.75,
					px: 1.25,
					py: 0.25,
					borderRadius: 1.5,
					color: "text.secondary",
					"&:hover": { color: "text.primary", bgcolor: "action.hover" },
				}}
			>
				<CloudOutlinedIcon sx={{ fontSize: 16 }} />
				<Typography variant="body2" sx={{ display: { xs: "none", sm: "block" } }}>
					Drive
				</Typography>
			</Link>
		</Box>
	);
}
