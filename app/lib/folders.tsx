import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DraftsOutlinedIcon from "@mui/icons-material/DraftsOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import type { ReactNode } from "react";
import { rainbowFor } from "~/theme";

/** Each folder's rainbow colour: system folders fixed, yours by id. */
const SYSTEM_COLORS: Record<string, string> = {
	inbox: "#4285f4",
	sent: "#34a853",
	draft: "#fa7b17",
	archive: "#a142f4",
	trash: "#ea4335",
	spam: "#fbbc04",
};

export function folderColor(id: string): string {
	return SYSTEM_COLORS[id] ?? rainbowFor(id);
}

export function folderIcon(id: string, props: { fontSize?: "small" | "medium" | "inherit" } = {}): ReactNode {
	switch (id) {
		case "inbox":
			return <InboxOutlinedIcon {...props} />;
		case "sent":
			return <SendOutlinedIcon {...props} />;
		case "draft":
			return <DraftsOutlinedIcon {...props} />;
		case "archive":
			return <ArchiveOutlinedIcon {...props} />;
		case "trash":
			return <DeleteOutlinedIcon {...props} />;
		case "spam":
			return <ReportGmailerrorredOutlinedIcon {...props} />;
		default:
			return <FolderOutlinedIcon {...props} />;
	}
}

/** Gmail-style date groups for a newest-first list. */
export function dateGroup(dateStr: string, now = new Date()): string {
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return "Older";
	const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const diff = Math.round((day(now) - day(d)) / 86_400_000);
	if (diff <= 0) return "Today";
	if (diff === 1) return "Yesterday";
	if (diff < 7) return "Earlier this week";
	if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return "Earlier this month";
	if (d.getFullYear() === now.getFullYear()) return d.toLocaleString(undefined, { month: "long" });
	return String(d.getFullYear());
}
