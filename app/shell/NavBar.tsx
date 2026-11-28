// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";

export interface NavBarItem {
	label: string;
	icon: ReactNode;
	/** Filled icon shown when selected (M3 swaps outlined for filled). */
	activeIcon?: ReactNode;
	to?: string;
	onClick?: () => void;
	selected?: boolean;
	badge?: number;
	/** Rainbow accent for the indicator and icon. */
	color?: string;
}

/** Height of the bar, for padding content and lifting floating buttons. */
export const NAV_BAR_HEIGHT = 80;

/**
 * Material 3 navigation bar for phones: up to five destinations along the
 * bottom, each an icon in an indicator pill with its label underneath.
 * Hidden from md up (the sidebar does the job there).
 */
export function NavBar({ items, hidden }: { items: NavBarItem[]; hidden?: boolean }) {
	if (hidden) return null;
	return (
		<Box
			component="nav"
			aria-label="Main"
			sx={{
				display: { xs: "flex", md: "none" },
				position: "fixed",
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: (t) => t.zIndex.appBar,
				height: `calc(${NAV_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
				pb: "env(safe-area-inset-bottom, 0px)",
				bgcolor: "background.default",
				borderTop: 1,
				borderColor: "divider",
			}}
		>
			{items.map((item) => {
				const tint = item.color ? `color-mix(in srgb, ${item.color} 20%, transparent)` : "var(--mui-palette-action-selected)";
				const link = item.to ? { component: RouterLink, to: item.to } : {};
				return (
					<ButtonBase
						key={item.label}
						{...link}
						onClick={item.onClick}
						aria-current={item.selected ? "page" : undefined}
						sx={{ flex: 1, flexDirection: "column", gap: 0.5, pt: 1.5, pb: 2, color: "text.secondary", "&:hover .nav-pill": { bgcolor: item.selected ? tint : "action.hover" } }}
					>
						<Box
							className="nav-pill"
							sx={{
								width: 64,
								height: 32,
								borderRadius: 4,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								bgcolor: item.selected ? tint : "transparent",
								color: item.selected ? (item.color ?? "text.primary") : "text.secondary",
								transition: "background-color .2s, width .2s",
							}}
						>
							<Badge badgeContent={item.badge && item.badge > 0 ? item.badge : undefined} max={99} sx={{ "& .MuiBadge-badge": { bgcolor: item.color ?? "error.main", color: "#fff", fontSize: 10, height: 16, minWidth: 16 } }}>
								{item.selected && item.activeIcon ? item.activeIcon : item.icon}
							</Badge>
						</Box>
						<Typography sx={{ fontSize: 12, fontWeight: item.selected ? 700 : 500, color: item.selected ? "text.primary" : "text.secondary" }}>{item.label}</Typography>
					</ButtonBase>
				);
			})}
		</Box>
	);
}
