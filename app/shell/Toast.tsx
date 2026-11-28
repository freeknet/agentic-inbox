// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
//
// The look of a toast in both apps: Google's dark snackbar with an icon,
// actions, a close button and a thin bar that counts down. It closes itself;
// hovering pauses the countdown. Slides in and out.
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Slide from "@mui/material/Slide";
import Typography from "@mui/material/Typography";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastCardProps {
	message: ReactNode;
	variant?: ToastVariant;
	actions?: { label: ReactNode; onClick: () => void }[];
	/** Milliseconds before it closes itself. */
	timeout: number;
	onClose: () => void;
	/** Override the variant icon (or false for none). */
	icon?: ReactNode | false;
}

const ICONS: Record<ToastVariant, ReactNode> = {
	success: <CheckCircleOutlineIcon fontSize="small" sx={{ color: "#81c995" }} />,
	error: <ErrorOutlineIcon fontSize="small" sx={{ color: "#f28b82" }} />,
	info: <InfoOutlinedIcon fontSize="small" sx={{ color: "#8ab4f8" }} />,
};

export function ToastCard({ message, variant = "info", actions, timeout, onClose, icon }: ToastCardProps) {
	const [shown, setShown] = useState(true);
	const [paused, setPaused] = useState(false);
	const left = useRef(timeout);
	const started = useRef(Date.now());
	const closing = useRef(false);
	const close = () => {
		if (closing.current) return;
		closing.current = true;
		setShown(false);
	};

	useEffect(() => {
		if (paused) return;
		started.current = Date.now();
		const t = setTimeout(close, left.current);
		return () => {
			clearTimeout(t);
			left.current -= Date.now() - started.current;
		};
	}, [paused]);

	const error = variant === "error";
	return (
		<Slide direction="right" in={shown} appear mountOnEnter unmountOnExit onExited={onClose}>
			<Box
				role={error ? "alert" : "status"}
				onMouseEnter={() => setPaused(true)}
				onMouseLeave={() => setPaused(false)}
				onFocus={() => setPaused(true)}
				onBlur={() => setPaused(false)}
				sx={{
					position: "relative",
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					minWidth: { xs: "calc(100vw - 32px)", sm: 344 },
					maxWidth: { xs: "calc(100vw - 32px)", sm: 560 },
					pl: 2,
					pr: 1,
					py: 1,
					minHeight: 48,
					borderRadius: 2,
					bgcolor: error ? "#8c1d18" : "#303134",
					color: "#e8eaed",
					boxShadow: 6,
					overflow: "hidden",
				}}
			>
				{icon !== false && (icon ?? ICONS[variant])}
				<Typography variant="body2" sx={{ flex: 1, py: 0.5 }}>
					{message}
				</Typography>
				{actions?.map((a, i) => (
					<Button
						key={i}
						size="small"
						onClick={() => {
							a.onClick();
							close();
						}}
						sx={{ color: error ? "#fff" : "#8ab4f8", fontWeight: 600, flexShrink: 0 }}
					>
						{a.label}
					</Button>
				))}
				<IconButton size="small" aria-label="Dismiss" onClick={close} sx={{ color: "inherit", flexShrink: 0 }}>
					<CloseIcon fontSize="small" />
				</IconButton>
				{/* Countdown: shrinks to nothing, pauses while hovered. */}
				<Box
					aria-hidden
					sx={{
						position: "absolute",
						left: 0,
						bottom: 0,
						height: 2,
						width: "100%",
						bgcolor: error ? "rgba(255,255,255,.5)" : "#8ab4f8",
						transformOrigin: "left",
						animation: `toast-countdown ${timeout}ms linear forwards`,
						animationPlayState: paused ? "paused" : "running",
						"@keyframes toast-countdown": { from: { transform: "scaleX(1)" }, to: { transform: "scaleX(0)" } },
					}}
				/>
			</Box>
		</Slide>
	);
}

/** Bottom-left stack the toasts sit in. */
export function ToastStack({ children }: { children: ReactNode }) {
	return (
		<Box
			sx={{
				position: "fixed",
				left: 16,
				// Phones: just under the header, clear of the Compose button, the
				// upload panel and compose's footer. Larger screens: bottom left.
				top: { xs: "calc(72px + env(safe-area-inset-top, 0px))", md: "auto" },
				bottom: { xs: "auto", md: 24 },
				zIndex: (t) => t.zIndex.snackbar,
				display: "flex",
				flexDirection: "column",
				gap: 1,
				pointerEvents: "none",
				"& > *": { pointerEvents: "auto" },
			}}
		>
			{children}
		</Box>
	);
}

/** A thin bar under the header while anything is loading. */
export function TopProgress({ active }: { active: boolean }) {
	const [visible, setVisible] = useState(false);
	// Only show for loads that take a moment, so quick ones don't flicker.
	useEffect(() => {
		if (!active) return setVisible(false);
		const t = setTimeout(() => setVisible(true), 250);
		return () => clearTimeout(t);
	}, [active]);
	return (
		<Box
			aria-hidden
			sx={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				height: 3,
				zIndex: (t) => t.zIndex.appBar + 1,
				overflow: "hidden",
				opacity: visible ? 1 : 0,
				transition: "opacity .3s",
				pointerEvents: "none",
				"&::before": {
					content: '""',
					position: "absolute",
					inset: 0,
					width: "40%",
					bgcolor: "primary.main",
					borderRadius: 2,
					animation: visible ? "top-progress 1.1s ease-in-out infinite" : "none",
				},
				"@keyframes top-progress": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(250%)" } },
			}}
		/>
	);
}
