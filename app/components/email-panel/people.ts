import type { Email } from "~/types";

/** The From display name from the stored headers, if the sender gave one. */
export function senderName(email: Pick<Email, "sender" | "raw_headers">): string | null {
	if (!email.raw_headers) return null;
	try {
		const headers = JSON.parse(email.raw_headers) as Array<{ key?: string; value?: string }>;
		const from = Array.isArray(headers) ? headers.find((h) => h.key?.toLowerCase() === "from")?.value : undefined;
		const m = from?.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
		const name = m?.[1]?.trim();
		return name && name.toLowerCase() !== email.sender.toLowerCase() ? name : null;
	} catch {
		return null;
	}
}

/** A short label for an address: "me" for the mailbox, else the part before @. */
export function shortAddress(address: string, self?: string): string {
	const a = address.trim();
	if (self && a.toLowerCase() === self.toLowerCase()) return "me";
	return a.split("@")[0] || a;
}

const COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#9334e6", "#007b83", "#c5221f", "#b06000", "#3949ab", "#00897b"];

/** A steady avatar colour per address. */
export function avatarColor(address: string): string {
	let h = 0;
	for (const ch of address.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return COLORS[h % COLORS.length];
}

/** "8 hours ago" for the last week, else null. */
export function relativeTime(dateStr: string, now = Date.now()): string | null {
	const t = new Date(dateStr).getTime();
	if (Number.isNaN(t)) return null;
	const mins = Math.round((now - t) / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
	return null;
}

/** Gmail's message date: today shows the time, this year the month and day. */
export function messageDate(dateStr: string, now = new Date()): string {
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return dateStr;
	if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
	if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
	return d.toLocaleString(undefined, opts);
}
