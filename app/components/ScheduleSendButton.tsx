import { Button } from "@cloudflare/kumo";
import { ClockIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

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

export default function ScheduleSendButton({ onSchedule, disabled }: { onSchedule: (at: Date) => void; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	const [custom, setCustom] = useState("");
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false);
		};
		const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", esc);
		return () => {
			document.removeEventListener("mousedown", close);
			document.removeEventListener("keydown", esc);
		};
	}, [open]);

	const pick = (at: Date) => {
		setOpen(false);
		onSchedule(at);
	};
	const now = new Date();
	const customDate = custom ? new Date(custom) : null;
	const customValid = !!customDate && !Number.isNaN(customDate.getTime()) && customDate.getTime() > Date.now() + 60_000;

	return (
		<div className="relative" ref={ref}>
			<Button
				type="button"
				variant="secondary"
				size="sm"
				shape="square"
				icon={<ClockIcon size={14} />}
				disabled={disabled}
				aria-label="Schedule send"
				aria-expanded={open}
				onClick={() => {
					setCustom(toLocalInput(atHour(new Date(), 1, 8)));
					setOpen((o) => !o);
				}}
			/>
			{open && (
				<div
					role="menu"
					className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border border-kumo-line bg-kumo-base p-2 shadow-lg"
				>
					<div className="px-2 pb-1 text-xs font-medium text-kumo-subtle">Schedule send</div>
					{presets(now).map((p) => (
						<button
							key={p.label}
							type="button"
							role="menuitem"
							className="flex w-full justify-between rounded px-2 py-1.5 text-left text-sm text-kumo-default hover:bg-kumo-fill"
							onClick={() => pick(p.at)}
						>
							<span>{p.label}</span>
						</button>
					))}
					<div className="mt-1 border-t border-kumo-line px-2 pt-2">
						<input
							type="datetime-local"
							value={custom}
							min={toLocalInput(now)}
							onChange={(e) => setCustom(e.target.value)}
							aria-label="Custom send time"
							className="w-full rounded border border-kumo-line bg-kumo-recessed px-2 py-1 text-sm text-kumo-default"
						/>
						<Button type="button" variant="primary" size="sm" className="mt-2 w-full" disabled={!customValid} onClick={() => customDate && pick(customDate)}>
							Schedule
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
