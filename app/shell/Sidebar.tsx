// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { createContext, type DragEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router";
import { SIDEBAR_WIDTH } from "./AppHeader";
import { useShellLayout } from "./layout";

/** Width of the collapsed icon rail. */
export const SIDEBAR_RAIL_WIDTH = 72;

/** True inside the collapsed rail (and not while it's hovered open). */
const RailContext = createContext(false);
const useRail = () => useContext(RailContext);

/**
 * The sidebar column: a permanent column on desktop, a drawer on phones.
 * Children are the same in both places. On desktop it can be collapsed to an
 * icon rail (header menu button); hovering the rail opens it over the
 * content, as in Gmail.
 */
export function SidebarFrame({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
	const collapsed = useShellLayout((s) => s.sidebarCollapsed);
	const [peek, setPeek] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => {
		void useShellLayout.persist.rehydrate();
	}, []);
	useEffect(() => () => clearTimeout(timer.current), []);
	useEffect(() => {
		if (!collapsed) setPeek(false);
	}, [collapsed]);

	const rail = collapsed && !peek;
	const hover = (on: boolean) => {
		clearTimeout(timer.current);
		if (!collapsed) return;
		timer.current = setTimeout(() => setPeek(on), on ? 250 : 120);
	};
	const column = (width: number) => (
		<Stack sx={{ height: 1, py: 1, width, bgcolor: "background.default", overflowX: "hidden", overflowY: "auto", transition: "width .2s" }}>{children}</Stack>
	);

	return (
		<>
			<Box
				component="nav"
				aria-label="Sidebar"
				sx={{ width: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH, flexShrink: 0, display: { xs: "none", md: "block" }, position: "relative", zIndex: 3, transition: "width .2s" }}
				onMouseEnter={() => hover(true)}
				onMouseLeave={() => hover(false)}
			>
				<Box
					sx={{
						position: collapsed ? "absolute" : "static",
						inset: collapsed ? "0 auto 0 0" : undefined,
						height: 1,
						borderTopRightRadius: peek ? 16 : 0,
						borderBottomRightRadius: peek ? 16 : 0,
						boxShadow: peek ? 8 : 0,
						overflow: "hidden",
					}}
				>
					<RailContext.Provider value={rail}>{column(rail ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH)}</RailContext.Provider>
				</Box>
			</Box>
			<Drawer
				open={open}
				onClose={onClose}
				sx={{ display: { md: "none" } }}
				slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, bgcolor: "background.default", borderRight: 0 } } }}
			>
				{column(SIDEBAR_WIDTH)}
			</Drawer>
		</>
	);
}

/** The big action button at the top (Compose, New), like Google's. */
export function SidebarPrimaryButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
	const rail = useRail();
	const look = {
		bgcolor: "background.paper",
		color: "text.primary",
		boxShadow: 2,
		"&:hover": { bgcolor: "action.hover", boxShadow: 4 },
	} as const;
	if (rail) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", pt: 0.5, pb: 2 }}>
				<Tooltip title={label} placement="right">
					<IconButton aria-label={label} onClick={onClick} sx={{ ...look, width: 56, height: 56, borderRadius: 4 }}>
						{icon}
					</IconButton>
				</Tooltip>
			</Box>
		);
	}
	return (
		<Box sx={{ px: 2, pt: 0.5, pb: 2 }}>
			<Button
				variant="contained"
				color="inherit"
				startIcon={icon}
				onClick={onClick}
				sx={{ ...look, borderRadius: 4, px: 2.5, py: 1.75, whiteSpace: "nowrap" }}
			>
				{label}
			</Button>
		</Box>
	);
}

export interface SidebarItemProps {
	icon: ReactNode;
	label: string;
	selected?: boolean;
	/** A route to link to, or a click handler. */
	to?: string;
	onClick?: () => void;
	/** Unread count or similar, shown bold at the right. */
	count?: number;
	/** Drop target highlighting (drag files onto a folder). */
	dropActive?: boolean;
	onDragOver?: (e: DragEvent) => void;
	onDragLeave?: (e: DragEvent) => void;
	onDrop?: (e: DragEvent) => void;
}

/** One navigation row: pill-shaped, icon, label, optional count. In the rail, the icon with a badge. */
export function SidebarItem({ icon, label, selected, to, onClick, count, dropActive, onDragOver, onDragLeave, onDrop }: SidebarItemProps) {
	const rail = useRail();
	const link = to ? { component: RouterLink, to } : {};
	const shown = count != null && count > 0 ? (count > 999 ? "999+" : String(count)) : null;
	const button = (
		<ListItemButton
			{...link}
			selected={selected}
			onClick={onClick}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
			aria-label={rail ? (shown ? `${label}, ${shown}` : label) : undefined}
			sx={{
				mx: 1,
				mb: 0.25,
				py: 0.5,
				minHeight: 36,
				...(rail && { justifyContent: "center", px: 0, mx: "auto", width: 56, borderRadius: 4 }),
				...(dropActive && { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 }),
			}}
		>
			<ListItemIcon sx={{ minWidth: rail ? 0 : 40, color: "inherit" }}>
				{rail && shown ? (
					<Badge badgeContent={shown} color="primary" max={999} sx={{ "& .MuiBadge-badge": { fontSize: 10, height: 16, minWidth: 16 } }}>
						{icon}
					</Badge>
				) : (
					icon
				)}
			</ListItemIcon>
			{!rail && <ListItemText primary={label} slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, fontWeight: selected ? 600 : 400 } } }} />}
			{!rail && shown && (
				<Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12, ml: 1 }}>
					{shown}
				</Typography>
			)}
		</ListItemButton>
	);
	return rail ? (
		<Tooltip title={label} placement="right">
			{button}
		</Tooltip>
	) : (
		button
	);
}

/** A small heading between groups of items, with an optional action on the right. A rule in the rail. */
export function SidebarSection({ title, action }: { title: string; action?: ReactNode }) {
	if (useRail()) return <Divider sx={{ mx: 2, my: 1 }} />;
	return (
		<Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", pl: 3, pr: 1.5, pt: 2, pb: 0.5 }}>
			<Typography variant="body2" sx={{ fontWeight: 500 }}>
				{title}
			</Typography>
			{action}
		</Stack>
	);
}

/** Pinned to the bottom of the sidebar (storage meter, account). Hidden in the rail. */
export function SidebarFooter({ children }: { children: ReactNode }) {
	if (useRail()) return null;
	return <Box sx={{ mt: "auto", px: 3, py: 2 }}>{children}</Box>;
}
