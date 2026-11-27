import AddToDriveIcon from "@mui/icons-material/AddToDrive";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DraftsOutlinedIcon from "@mui/icons-material/DraftsOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import KeyboardOutlinedIcon from "@mui/icons-material/KeyboardOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import RefreshIcon from "@mui/icons-material/Refresh";
import ReportGmailerrorredOutlinedIcon from "@mui/icons-material/ReportGmailerrorredOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import ViewQuiltOutlinedIcon from "@mui/icons-material/ViewQuiltOutlined";
import Typography from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { SYSTEM_FOLDER_IDS } from "shared/folders";
import { useUIStore } from "~/hooks/useUIStore";
import { usePrefs } from "~/lib/prefs";
import { useDrive } from "~/queries/drive";
import { useFolders } from "~/queries/folders";
import { useShellLayout } from "~/shell/layout";
import { type Command, CommandPalette, type ShortcutGroup, ShortcutsDialog, useShortcuts } from "~/shell/Shortcuts";

/** Every Mail shortcut, for the "?" dialog. The list shortcuts live in routes/email-list.tsx. */
export const MAIL_SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		title: "Anywhere",
		items: [
			["c", "Compose"],
			["/", "Search mail"],
			["mod+k", "Command palette"],
			["?", "Show these shortcuts"],
			["shift+r", "Refresh"],
			["[", "Collapse or expand the sidebar"],
		],
	},
	{
		title: "Go to",
		items: [
			["g i", "Inbox"],
			["g t", "Sent"],
			["g d", "Drafts"],
			["g a", "Archive"],
			["g #", "Trash"],
			["g ,", "Settings"],
		],
	},
	{
		title: "Message list",
		items: [
			["j", "Next conversation"],
			["k", "Previous conversation"],
			["o", "Open (also Enter)"],
			["u", "Close the message"],
			["x", "Select"],
			["shift+a", "Select all / none"],
		],
	},
	{
		title: "Actions",
		items: [
			["r", "Reply"],
			["a", "Reply all"],
			["f", "Forward"],
			["e", "Archive"],
			["#", "Delete (Trash)"],
			["s", "Star / unstar"],
			["shift+i", "Mark as read"],
			["shift+u", "Mark as unread"],
			["v", "Move to…"],
			["escape", "Clear the selection"],
		],
	},
];

const FOLDER_META: Record<string, { label: string; icon: React.ReactNode; keys?: string }> = {
	inbox: { label: "Inbox", icon: <InboxOutlinedIcon fontSize="small" />, keys: "g i" },
	sent: { label: "Sent", icon: <SendOutlinedIcon fontSize="small" />, keys: "g t" },
	draft: { label: "Drafts", icon: <DraftsOutlinedIcon fontSize="small" />, keys: "g d" },
	archive: { label: "Archive", icon: <ArchiveOutlinedIcon fontSize="small" />, keys: "g a" },
	trash: { label: "Trash", icon: <DeleteOutlineIcon fontSize="small" />, keys: "g #" },
	spam: { label: "Spam", icon: <ReportGmailerrorredOutlinedIcon fontSize="small" /> },
};

/**
 * App-wide shortcuts for a mailbox (compose, search, go to…), the "?" help
 * and the Ctrl+K command palette. Rendered once by the mailbox layout.
 */
export default function MailShortcuts() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { setMode } = useColorScheme();
	const enabled = usePrefs((p) => p.keyboardShortcuts);
	const setPref = usePrefs((p) => p.set);
	const { startCompose, toggleAgentPanel, isShortcutsOpen, setShortcutsOpen, isPaletteOpen, setPaletteOpen } = useUIStore();
	const { data: folders = [] } = useFolders(mailboxId);
	const drive = useDrive();

	const base = mailboxId ? `/mailbox/${encodeURIComponent(mailboxId)}` : "";
	const go = (folder: string) => base && navigate(`${base}/emails/${folder}`);
	const compose = () => {
		// Compose lives on the list pages; elsewhere open the inbox first.
		if (!window.location.pathname.includes("/emails/")) go("inbox");
		startCompose({ mode: "new", originalEmail: null });
	};
	const focusSearch = () => document.querySelector<HTMLInputElement>('header [role="search"] input')?.focus();
	const refresh = () => {
		if (!mailboxId) return;
		for (const key of ["emails", "folders", "search", "mailboxes"]) void queryClient.invalidateQueries({ queryKey: [key] });
	};
	const toggleSidebar = () => {
		const s = useShellLayout.getState();
		s.setSidebarCollapsed(!s.sidebarCollapsed);
	};

	useShortcuts(
		{
			c: compose,
			"/": focusSearch,
			"?": () => setShortcutsOpen(true),
			"shift+r": refresh,
			"[": toggleSidebar,
			"g i": () => go("inbox"),
			"g t": () => go("sent"),
			"g d": () => go("draft"),
			"g a": () => go("archive"),
			"g #": () => go("trash"),
			"g ,": () => base && navigate(`${base}/settings`),
		},
		enabled,
	);
	// The palette works even with single-key shortcuts off.
	useShortcuts({ "mod+k": () => setPaletteOpen(!useUIStore.getState().isPaletteOpen) });

	const commands = useMemo<Command[]>(() => {
		const list: Command[] = [
			{ id: "compose", group: "Actions", label: "Compose", icon: <EditOutlinedIcon fontSize="small" />, keys: "c", keywords: "new write email", run: compose },
			{ id: "search", group: "Actions", label: "Search mail", icon: <SearchIcon fontSize="small" />, keys: "/", keywords: "find", run: focusSearch },
			{ id: "refresh", group: "Actions", label: "Refresh", icon: <RefreshIcon fontSize="small" />, keys: "shift+r", keywords: "reload sync", run: refresh },
		];
		const systemIds = SYSTEM_FOLDER_IDS as readonly string[];
		for (const id of [...systemIds, "spam"]) {
			const meta = FOLDER_META[id];
			if (meta) list.push({ id: `go-${id}`, group: "Go to", label: meta.label, icon: meta.icon, keys: meta.keys, keywords: "folder open", run: () => go(id) });
		}
		for (const f of folders.filter((f) => !systemIds.includes(f.id) && f.id !== "spam")) {
			list.push({ id: `go-${f.id}`, group: "Go to", label: f.name, icon: <FolderOutlinedIcon fontSize="small" />, keywords: "folder label", run: () => go(f.id) });
		}
		list.push({ id: "settings", group: "Go to", label: "Settings", icon: <SettingsOutlinedIcon fontSize="small" />, keys: "g ,", keywords: "preferences options", run: () => base && navigate(`${base}/settings`) });
		if (drive?.url) list.push({ id: "drive", group: "Go to", label: "Drive", icon: <AddToDriveIcon fontSize="small" />, keywords: "files storage app", run: () => (window.location.href = drive.url) });
		list.push(
			{ id: "sidebar", group: "View", label: "Collapse or expand the sidebar", icon: <MenuOpenIcon fontSize="small" />, keys: "[", keywords: "rail menu", run: toggleSidebar },
			{ id: "agent", group: "View", label: "Show or hide the AI agent panel", icon: <SmartToyOutlinedIcon fontSize="small" />, keywords: "assistant ai", run: toggleAgentPanel },
			{ id: "pane-right", group: "View", label: "Reading pane: right of the list", icon: <ViewQuiltOutlinedIcon fontSize="small" />, keywords: "layout split", run: () => setPref("readingPane", "right") },
			{ id: "pane-below", group: "View", label: "Reading pane: below the list", icon: <ViewQuiltOutlinedIcon fontSize="small" />, keywords: "layout split", run: () => setPref("readingPane", "below") },
			{ id: "pane-off", group: "View", label: "Reading pane: no split", icon: <ViewQuiltOutlinedIcon fontSize="small" />, keywords: "layout split full", run: () => setPref("readingPane", "off") },
			{ id: "density", group: "View", label: "Toggle compact rows", icon: <ViewQuiltOutlinedIcon fontSize="small" />, keywords: "density comfortable", run: () => setPref("density", usePrefs.getState().density === "compact" ? "comfortable" : "compact") },
			{ id: "theme-light", group: "Theme", label: "Light theme", icon: <LightModeOutlinedIcon fontSize="small" />, keywords: "appearance colour", run: () => setMode("light") },
			{ id: "theme-dark", group: "Theme", label: "Dark theme", icon: <DarkModeOutlinedIcon fontSize="small" />, keywords: "appearance colour", run: () => setMode("dark") },
			{ id: "theme-system", group: "Theme", label: "Theme follows the system", icon: <BrightnessAutoIcon fontSize="small" />, keywords: "appearance colour auto", run: () => setMode("system") },
			{ id: "shortcuts", group: "Help", label: "Keyboard shortcuts", icon: <KeyboardOutlinedIcon fontSize="small" />, keys: "?", keywords: "keys hotkeys", run: () => setShortcutsOpen(true) },
		);
		return list;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [folders, drive?.url, base]);

	return (
		<>
			<ShortcutsDialog
				open={isShortcutsOpen}
				onClose={() => setShortcutsOpen(false)}
				groups={MAIL_SHORTCUT_GROUPS}
				footer={
					<Typography variant="caption" color="text.secondary">
						{enabled ? "Single-key shortcuts are on." : "Single-key shortcuts are off; Ctrl+K still works."} Turn them on or off in Settings → Behaviour.
					</Typography>
				}
			/>
			<CommandPalette open={isPaletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
		</>
	);
}
