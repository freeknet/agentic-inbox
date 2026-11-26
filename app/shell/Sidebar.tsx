// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { DragEvent, ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { SIDEBAR_WIDTH } from "./AppHeader";

/**
 * The sidebar column: a permanent column on desktop, a drawer on phones.
 * Children are the same in both places.
 */
export function SidebarFrame({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
	const column = (
		<Stack sx={{ height: 1, py: 1, width: SIDEBAR_WIDTH, bgcolor: "background.default" }}>{children}</Stack>
	);
	return (
		<>
			<Box component="nav" aria-label="Sidebar" sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, display: { xs: "none", md: "block" } }}>
				{column}
			</Box>
			<Drawer
				open={open}
				onClose={onClose}
				sx={{ display: { md: "none" } }}
				slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, bgcolor: "background.default", borderRight: 0 } } }}
			>
				{column}
			</Drawer>
		</>
	);
}

/** The big action button at the top (Compose, New), like Google's. */
export function SidebarPrimaryButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
	return (
		<Box sx={{ px: 2, pt: 0.5, pb: 2 }}>
			<Button
				variant="contained"
				color="inherit"
				startIcon={icon}
				onClick={onClick}
				sx={{
					borderRadius: 4,
					px: 2.5,
					py: 1.75,
					bgcolor: "background.paper",
					color: "text.primary",
					boxShadow: 2,
					"&:hover": { bgcolor: "action.hover", boxShadow: 4 },
				}}
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

/** One navigation row: pill-shaped, icon, label, optional count. */
export function SidebarItem({ icon, label, selected, to, onClick, count, dropActive, onDragOver, onDragLeave, onDrop }: SidebarItemProps) {
	const link = to ? { component: RouterLink, to } : {};
	return (
		<ListItemButton
			{...link}
			selected={selected}
			onClick={onClick}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
			sx={{
				mx: 1,
				mb: 0.25,
				py: 0.5,
				minHeight: 36,
				...(dropActive && { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 }),
			}}
		>
			<ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>{icon}</ListItemIcon>
			<ListItemText primary={label} slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, fontWeight: selected ? 600 : 400 } } }} />
			{count != null && count > 0 && (
				<Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12, ml: 1 }}>
					{count > 999 ? "999+" : count}
				</Typography>
			)}
		</ListItemButton>
	);
}

/** A small heading between groups of items, with an optional action on the right. */
export function SidebarSection({ title, action }: { title: string; action?: ReactNode }) {
	return (
		<Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", pl: 3, pr: 1.5, pt: 2, pb: 0.5 }}>
			<Typography variant="body2" sx={{ fontWeight: 500 }}>
				{title}
			</Typography>
			{action}
		</Stack>
	);
}

/** Pinned to the bottom of the sidebar (storage meter, account). */
export function SidebarFooter({ children }: { children: ReactNode }) {
	return <Box sx={{ mt: "auto", px: 3, py: 2 }}>{children}</Box>;
}
