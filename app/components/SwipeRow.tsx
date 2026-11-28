import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import Box from "@mui/material/Box";
import { type ReactNode, useRef, useState } from "react";

/** How far (share of the row's width) a swipe must go to count. */
const THRESHOLD = 0.35;

/**
 * Gmail's swipe: on a touch screen, drag a row sideways to archive it. The
 * row follows the finger over a green "Archive" strip, and springs back if
 * let go early. Mouse and pen are left alone, and vertical scrolling wins
 * when the drag starts up or down.
 */
export function SwipeRow({ children, onSwipe, disabled, label = "Archive", icon = <ArchiveOutlinedIcon /> }: { children: ReactNode; onSwipe: () => void; disabled?: boolean; label?: string; icon?: ReactNode }) {
	const [dx, setDx] = useState(0);
	const [dragging, setDragging] = useState(false);
	const start = useRef<{ x: number; y: number; width: number; axis: "x" | "y" | null } | null>(null);
	const swallowClick = useRef(false);

	const end = () => {
		const s = start.current;
		start.current = null;
		setDragging(false);
		if (!s || s.axis !== "x") return;
		if (Math.abs(dx) > s.width * THRESHOLD) {
			// Slide the rest of the way out, then archive (the list collapses the row).
			setDx(dx > 0 ? s.width : -s.width);
			setTimeout(onSwipe, 160);
		} else {
			setDx(0);
		}
	};

	const past = start.current ? Math.abs(dx) > start.current.width * THRESHOLD : false;
	return (
		<Box
			sx={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}
			onPointerDown={(e) => {
				if (disabled || e.pointerType !== "touch") return;
				start.current = { x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth, axis: null };
			}}
			onPointerMove={(e) => {
				const s = start.current;
				if (!s) return;
				const mx = e.clientX - s.x;
				const my = e.clientY - s.y;
				if (!s.axis) {
					if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
					s.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
					if (s.axis === "x") {
						setDragging(true);
						swallowClick.current = true;
						e.currentTarget.setPointerCapture(e.pointerId);
					}
				}
				if (s.axis === "x") setDx(mx);
			}}
			onPointerUp={end}
			onPointerCancel={end}
			// A swipe isn't a tap: don't open the message when the finger lifts.
			onClickCapture={(e) => {
				if (swallowClick.current) {
					swallowClick.current = false;
					e.stopPropagation();
					e.preventDefault();
				}
			}}
		>
			{dx !== 0 && (
				<Box
					aria-hidden
					sx={{
						position: "absolute",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: dx > 0 ? "flex-start" : "flex-end",
						gap: 1,
						px: 3,
						bgcolor: past ? "success.main" : "action.selected",
						color: past ? "success.contrastText" : "text.secondary",
						transition: "background-color .15s",
						fontWeight: 500,
						fontSize: 14,
					}}
				>
					{icon}
					{label}
				</Box>
			)}
			<Box
				sx={{
					position: "relative",
					bgcolor: "background.paper",
					transform: `translateX(${dx}px)`,
					transition: dragging ? "none" : "transform .18s ease",
				}}
			>
				{children}
			</Box>
		</Box>
	);
}
