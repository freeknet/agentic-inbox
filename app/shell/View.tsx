// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import type { ReactNode } from "react";

/**
 * The row at the top of the content card: a title (or breadcrumbs, or the
 * selection bar while items are selected) on the left, view controls on the
 * right.
 */
export function ViewHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
	return (
		<Stack direction="row" spacing={1} sx={{ alignItems: "center", px: { xs: 1, sm: 2 }, pt: 1.5, pb: 1, minHeight: 64, flexShrink: 0 }}>
			<Box sx={{ flex: 1, minWidth: 0 }}>{typeof title === "string" ? <ViewTitle>{title}</ViewTitle> : title}</Box>
			{children}
		</Stack>
	);
}

export function ViewTitle({ children }: { children: ReactNode }) {
	return (
		<Typography component="h1" sx={{ fontSize: 22, px: 1.5, py: 0.5 }} noWrap>
			{children}
		</Typography>
	);
}

/** Replaces the title while items are selected: clear, count, then actions. */
export function SelectionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
	return (
		<Stack
			direction="row"
			spacing={0.5}
			role="toolbar"
			aria-label="Selection actions"
			sx={{
				alignItems: "center",
				bgcolor: "action.hover",
				borderRadius: 999,
				px: 1,
				minHeight: 48,
				// Scrolls sideways on phones, without a scrollbar.
				overflowX: "auto",
				scrollbarWidth: "none",
				"&::-webkit-scrollbar": { display: "none" },
			}}
		>
			<IconButton aria-label="Clear selection" onClick={onClear}>
				<CloseIcon />
			</IconButton>
			<Typography sx={{ mr: 1.5, whiteSpace: "nowrap" }}>{count} selected</Typography>
			{children}
		</Stack>
	);
}

/** An icon button with a tooltip, as used in selection bars and toolbars. */
export function ActionButton({ title, onClick, disabled, children }: { title: string; onClick: (e: React.MouseEvent<HTMLElement>) => void; disabled?: boolean; children: ReactNode }) {
	return (
		<Tooltip title={title}>
			<span>
				<IconButton aria-label={title} onClick={onClick} disabled={disabled}>
					{children}
				</IconButton>
			</span>
		</Tooltip>
	);
}

/** Large faded icon, title and one line of help, centred in an empty view. */
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
	return (
		<Stack spacing={1.5} sx={{ alignItems: "center", textAlign: "center", maxWidth: 380, mx: "auto", color: "text.secondary", "& > svg": { fontSize: 96, opacity: 0.4 } }}>
			{icon}
			<Typography variant="h6" sx={{ color: "text.primary" }}>
				{title}
			</Typography>
			<Typography variant="body2">{body}</Typography>
			{action}
		</Stack>
	);
}

/** A menu opened at the pointer (right-click) or under a button. */
export function PositionedMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
	return (
		<Menu
			open
			onClose={onClose}
			anchorReference="anchorPosition"
			anchorPosition={{ top: y, left: x }}
			onContextMenu={(e) => {
				// A second right-click closes the menu instead of opening the browser's.
				e.preventDefault();
				onClose();
			}}
			slotProps={{ paper: { sx: { minWidth: 260 } }, list: { dense: true } }}
		>
			{children}
		</Menu>
	);
}

/** One row of a PositionedMenu: icon, label, optional shortcut hint. */
export function MenuEntry({ icon, label, hint, danger, onClick }: { icon: ReactNode; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
	return (
		<MenuItem onClick={onClick} sx={danger ? { color: "error.main" } : undefined}>
			<ListItemIcon sx={danger ? { color: "error.main" } : undefined}>{icon}</ListItemIcon>
			<ListItemText>{label}</ListItemText>
			{hint && (
				<Typography variant="body2" sx={{ color: "text.secondary", ml: 3 }}>
					{hint}
				</Typography>
			)}
		</MenuItem>
	);
}
