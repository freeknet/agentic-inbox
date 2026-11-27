// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
//
// Keyboard shortcuts (Gmail-style single keys and "g then x" sequences), the
// "?" help dialog, and the Ctrl+K command palette.
import KeyboardIcon from "@mui/icons-material/KeyboardOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

/** True while the user is typing somewhere (fields, rich text). */
export function isTyping(el: Element | null = document.activeElement): boolean {
	if (!el) return false;
	const h = el as HTMLElement;
	if (h.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
	if (el.tagName !== "INPUT") return false;
	const type = (el as HTMLInputElement).type;
	return !["checkbox", "radio", "button", "submit", "range"].includes(type);
}

/** Normalised name for a key press: "c", "shift+i", "#", "?", "mod+k", "enter", "escape". */
function keyName(e: KeyboardEvent): string {
	const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
	const mods: string[] = [];
	if (e.ctrlKey || e.metaKey) mods.push("mod");
	if (e.altKey) mods.push("alt");
	// Shift only counts for letters; "?" and "#" already carry it.
	if (e.shiftKey && /^[a-z]$/.test(k)) mods.push("shift");
	return [...mods, k].join("+");
}

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Listens for shortcuts while `enabled`. Keys are names like "c", "shift+i",
 * "mod+k", or sequences like "g i" (g, then i within 1.5 s). Ignored while
 * typing or while a dialog or menu is open, except "mod+…" keys.
 */
export function useShortcuts(map: ShortcutMap, enabled = true) {
	const ref = useRef(map);
	ref.current = map;
	useEffect(() => {
		if (!enabled) return;
		let pending: string | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.isComposing) return;
			const name = keyName(e);
			const modded = name.startsWith("mod+");
			if (!modded && (isTyping() || document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]'))) return;
			const shortcuts = ref.current;
			const seq = pending ? `${pending} ${name}` : null;
			pending = null;
			clearTimeout(timer);
			const fn = (seq && shortcuts[seq]) || shortcuts[name];
			if (fn) {
				e.preventDefault();
				fn(e);
				return;
			}
			if (Object.keys(shortcuts).some((k) => k.startsWith(`${name} `))) {
				pending = name;
				timer = setTimeout(() => (pending = null), 1500);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
			clearTimeout(timer);
		};
	}, [enabled]);
}

/** One key, drawn like a keycap. "mod" shows as Ctrl (⌘ on Apple). */
export function Kbd({ children }: { children: string }) {
	const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
	const label = children === "mod" ? (apple ? "⌘" : "Ctrl") : children === "shift" ? "Shift" : children.length === 1 ? children : children[0].toUpperCase() + children.slice(1);
	return (
		<Box
			component="kbd"
			sx={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				minWidth: 22,
				height: 22,
				px: 0.75,
				borderRadius: 1,
				border: 1,
				borderColor: "divider",
				borderBottomWidth: 2,
				bgcolor: "action.hover",
				fontFamily: "inherit",
				fontSize: 12,
				fontWeight: 500,
			}}
		>
			{label}
		</Box>
	);
}

/** Keys for display: "g i" → g then i; "shift+i" → Shift + I. */
export function KeyCombo({ keys }: { keys: string }) {
	const steps = keys.split(" ");
	return (
		<Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
			{steps.map((step, i) => (
				<Box key={i} component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
					{i > 0 && (
						<Typography component="span" variant="caption" color="text.secondary" sx={{ mx: 0.25 }}>
							then
						</Typography>
					)}
					{step.split("+").map((k, j) => (
						<Kbd key={j}>{k}</Kbd>
					))}
				</Box>
			))}
		</Box>
	);
}

export interface ShortcutGroup {
	title: string;
	items: [keys: string, label: string][];
}

/** The "?" dialog listing every shortcut. */
export function ShortcutsDialog({ open, onClose, groups, footer }: { open: boolean; onClose: () => void; groups: ShortcutGroup[]; footer?: ReactNode }) {
	return (
		<Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
			<DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 6 }}>
				<KeyboardIcon /> Keyboard shortcuts
				<IconButton aria-label="Close" onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}>
					<CloseIcon />
				</IconButton>
			</DialogTitle>
			<DialogContent>
				<Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { sm: "1fr 1fr" } }}>
					{groups.map((g) => (
						<Box key={g.title}>
							<Typography variant="subtitle2" sx={{ mb: 1 }}>
								{g.title}
							</Typography>
							{g.items.map(([keys, label]) => (
								<Box key={keys} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, py: 0.5 }}>
									<Typography variant="body2">{label}</Typography>
									<KeyCombo keys={keys} />
								</Box>
							))}
						</Box>
					))}
				</Box>
				{footer && <Box sx={{ mt: 3 }}>{footer}</Box>}
			</DialogContent>
		</Dialog>
	);
}

export interface Command {
	id: string;
	label: string;
	group: string;
	icon?: ReactNode;
	/** Shortcut shown on the right. */
	keys?: string;
	/** Extra words to match on. */
	keywords?: string;
	run: () => void;
}

/**
 * Ctrl+K: type to find any action or place, arrow keys to choose, Enter to run.
 */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
	const [q, setQ] = useState("");
	const [active, setActive] = useState(0);
	const listRef = useRef<HTMLUListElement>(null);
	useEffect(() => {
		if (open) {
			setQ("");
			setActive(0);
		}
	}, [open]);
	const results = useMemo(() => {
		const words = q.toLowerCase().split(/\s+/).filter(Boolean);
		return commands.filter((c) => {
			const hay = `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase();
			return words.every((w) => hay.includes(w));
		});
	}, [q, commands]);
	useEffect(() => setActive(0), [q]);
	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const run = (c: Command | undefined) => {
		if (!c) return;
		onClose();
		// After the dialog closes, so focus and routing land on the page.
		setTimeout(c.run, 0);
	};

	let lastGroup = "";
	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth
			slotProps={{ paper: { sx: { alignSelf: "flex-start", mt: "12vh", borderRadius: 4 } } }}
		>
			<TextField
				autoFocus
				fullWidth
				placeholder="Type a command or a place…"
				value={q}
				onChange={(e) => setQ(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setActive((i) => Math.min(results.length - 1, i + 1));
					} else if (e.key === "ArrowUp") {
						e.preventDefault();
						setActive((i) => Math.max(0, i - 1));
					} else if (e.key === "Enter") {
						e.preventDefault();
						run(results[active]);
					}
				}}
				slotProps={{
					htmlInput: { "aria-label": "Command", "aria-controls": "command-results", "aria-activedescendant": results[active] ? `cmd-${results[active].id}` : undefined },
					input: {
						startAdornment: (
							<InputAdornment position="start">
								<SearchIcon />
							</InputAdornment>
						),
						sx: { "& fieldset": { border: 0 }, fontSize: 17, py: 0.5 },
					},
				}}
				sx={{ borderBottom: 1, borderColor: "divider" }}
			/>
			<List id="command-results" ref={listRef} role="listbox" dense sx={{ maxHeight: "50vh", overflowY: "auto", py: 0 }}>
				{results.length === 0 && (
					<Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
						Nothing matches "{q}".
					</Typography>
				)}
				{results.map((c, i) => {
					const header = c.group !== lastGroup ? c.group : null;
					lastGroup = c.group;
					return (
						<Box key={c.id}>
							{header && <ListSubheader sx={{ lineHeight: "32px", bgcolor: "background.paper" }}>{header}</ListSubheader>}
							<ListItemButton
								id={`cmd-${c.id}`}
								data-index={i}
								role="option"
								aria-selected={i === active}
								selected={i === active}
								onMouseMove={() => setActive(i)}
								onClick={() => run(c)}
								sx={{ mx: 1, borderRadius: 2 }}
							>
								{c.icon && <ListItemIcon sx={{ minWidth: 36 }}>{c.icon}</ListItemIcon>}
								<ListItemText primary={c.label} />
								{c.keys && <KeyCombo keys={c.keys} />}
							</ListItemButton>
						</Box>
					);
				})}
			</List>
		</Dialog>
	);
}
