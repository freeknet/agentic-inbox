// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import Box from "@mui/material/Box";
import { useRef } from "react";

export interface ResizeHandleProps {
	/** "x" sits between side-by-side panes; "y" between stacked ones. */
	axis: "x" | "y";
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
	/** Double-click (or Enter) restores the default size. */
	onReset?: () => void;
	label: string;
	/** Size of the gap the handle fills, in px (the space between cards). */
	gap?: number;
}

/**
 * A drag handle in the gap between two panes. Drag with the mouse or finger,
 * use the arrow keys when focused, double-click to reset.
 */
export function ResizeHandle({ axis, value, min, max, onChange, onReset, label, gap = 16 }: ResizeHandleProps) {
	const start = useRef<{ pos: number; value: number } | null>(null);
	const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
	const horizontal = axis === "x";
	return (
		<Box
			role="separator"
			aria-label={label}
			aria-orientation={horizontal ? "vertical" : "horizontal"}
			aria-valuenow={value}
			aria-valuemin={min}
			aria-valuemax={max}
			tabIndex={0}
			onPointerDown={(e) => {
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				start.current = { pos: horizontal ? e.clientX : e.clientY, value };
				document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
				document.body.style.userSelect = "none";
			}}
			onPointerMove={(e) => {
				if (!start.current) return;
				const pos = horizontal ? e.clientX : e.clientY;
				onChange(clamp(start.current.value + pos - start.current.pos));
			}}
			onPointerUp={(e) => {
				start.current = null;
				e.currentTarget.releasePointerCapture(e.pointerId);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}}
			onDoubleClick={onReset}
			onKeyDown={(e) => {
				const step = e.shiftKey ? 64 : 16;
				const back = horizontal ? "ArrowLeft" : "ArrowUp";
				const fwd = horizontal ? "ArrowRight" : "ArrowDown";
				if (e.key === back) onChange(clamp(value - step));
				else if (e.key === fwd) onChange(clamp(value + step));
				else if (e.key === "Enter" && onReset) onReset();
				else return;
				e.preventDefault();
			}}
			sx={{
				flexShrink: 0,
				position: "relative",
				[horizontal ? "width" : "height"]: gap,
				cursor: horizontal ? "col-resize" : "row-resize",
				touchAction: "none",
				outline: "none",
				// The visible grip: a short pill that brightens on hover, drag or focus.
				"&::after": {
					content: '""',
					position: "absolute",
					borderRadius: 2,
					bgcolor: "divider",
					opacity: 0,
					transition: "opacity .15s, background-color .15s",
					...(horizontal
						? { top: "50%", left: "50%", width: 4, height: 40, transform: "translate(-50%, -50%)" }
						: { left: "50%", top: "50%", height: 4, width: 40, transform: "translate(-50%, -50%)" }),
				},
				"&:hover::after, &:active::after, &:focus-visible::after": { opacity: 1, bgcolor: "primary.main" },
			}}
		/>
	);
}
