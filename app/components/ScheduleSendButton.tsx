import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuList from "@mui/material/MenuList";
import Popover from "@mui/material/Popover";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type MouseEvent, useState } from "react";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import Tooltip from "@mui/material/Tooltip";

function atHour(base: Date, days: number, hour: number): Date {
	const d = new Date(base);
	d.setDate(d.getDate() + days);
	d.setHours(hour, 0, 0, 0);
	return d;
}

function presets(now: Date): Array<{ label: string; at: Date }> {
	const list: Array<{ label: string; at: Date }> = [];
	if (now.getHours() < 16) list.push({ label: "This afternoon, 5 PM", at: atHour(now, 0, 17) });
	list.push({ label: "Tomorrow morning, 8 AM", at: atHour(now, 1, 8) });
	const toMonday = ((8 - now.getDay()) % 7) || 7;
	list.push({ label: "Monday morning, 8 AM", at: atHour(now, toMonday, 8) });
	return list;
}

/** `datetime-local` value for a Date, in local time. */
function toLocalInput(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleSendButton({
	onSchedule,
	disabled,
	variant = "icon",
}: {
	onSchedule: (at: Date) => void;
	disabled?: boolean;
	/** "split": the ▾ half of an M3 split button, joined to the Send button on its left. */
	variant?: "icon" | "split";
}) {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const [custom, setCustom] = useState("");
	const now = new Date();
	const customDate = custom ? new Date(custom) : null;
	const customValid =
		!!customDate && !Number.isNaN(customDate.getTime()) && customDate.getTime() > Date.now() + 60_000;

	const pick = (at: Date) => {
		setAnchor(null);
		onSchedule(at);
	};

	const open = (e: MouseEvent<HTMLElement>) => {
		setCustom(toLocalInput(atHour(new Date(), 1, 8)));
		setAnchor(e.currentTarget);
	};

	return (
		<>
			{variant === "split" ? (
				<Tooltip title="Schedule send">
					<span>
						<Button
							variant="contained"
							size="small"
							disabled={disabled}
							aria-label="Schedule send"
							aria-haspopup="dialog"
							aria-expanded={!!anchor}
							onClick={open}
							sx={{ minWidth: 0, px: 0.75, height: "100%", borderRadius: "0 8px 8px 0", borderLeft: "1px solid rgba(255,255,255,.35)" }}
						>
							<ArrowDropDownIcon fontSize="small" />
						</Button>
					</span>
				</Tooltip>
			) : (
				<IconButton
					size="small"
					disabled={disabled}
					aria-label="Schedule send"
					aria-expanded={!!anchor}
					onClick={open}
					sx={{ border: 1, borderColor: "divider" }}
				>
					<ScheduleOutlinedIcon fontSize="small" />
				</IconButton>
			)}
			{/* A Popover, not a Menu: a Menu's arrow-key and Tab handling would take over the date field. */}
			<Popover
				anchorEl={anchor}
				open={!!anchor}
				onClose={() => setAnchor(null)}
				anchorOrigin={{ vertical: "top", horizontal: "right" }}
				transformOrigin={{ vertical: "bottom", horizontal: "right" }}
				slotProps={{ paper: { sx: { width: 280, p: 1 } } }}
			>
				<Typography variant="caption" color="text.secondary" sx={{ px: 1, pb: 0.5, display: "block" }}>
					Schedule send
				</Typography>
				<MenuList dense autoFocusItem aria-label="Send later presets" sx={{ py: 0 }}>
					{presets(now).map((p) => (
						<MenuItem key={p.label} onClick={() => pick(p.at)} sx={{ fontSize: 14 }}>
							{p.label}
						</MenuItem>
					))}
				</MenuList>
				<Box sx={{ borderTop: 1, borderColor: "divider", mt: 0.5, pt: 1, px: 1 }}>
					<TextField
						fullWidth
						size="small"
						type="datetime-local"
						value={custom}
						onChange={(e) => setCustom(e.target.value)}
						slotProps={{
							input: { sx: { fontSize: 13 } },
							inputLabel: { shrink: true },
							htmlInput: {
								min: toLocalInput(now),
								"aria-label": "Custom send time",
							},
						}}
					/>
					<Button
						fullWidth
						variant="contained"
						size="small"
						sx={{ mt: 1 }}
						disabled={!customValid}
						onClick={() => customDate && pick(customDate)}
					>
						Schedule
					</Button>
				</Box>
			</Popover>
		</>
	);
}
