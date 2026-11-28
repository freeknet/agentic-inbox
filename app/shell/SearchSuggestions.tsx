// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";

/** Recent searches for one app, kept in this browser (newest first, eight at most). */
export function useRecentSearches(key: string) {
	const [items, setItems] = useState<string[]>([]);
	useEffect(() => {
		try {
			setItems(JSON.parse(localStorage.getItem(key) ?? "[]"));
		} catch {}
	}, [key]);
	const save = useCallback(
		(next: string[]) => {
			setItems(next);
			try {
				localStorage.setItem(key, JSON.stringify(next));
			} catch {}
		},
		[key],
	);
	return {
		items,
		add: (q: string) => {
			const t = q.trim();
			if (t) save([t, ...items.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8));
		},
		remove: (q: string) => save(items.filter((x) => x !== q)),
	};
}

export interface SearchTip {
	label: string;
	/** Text added to the query, e.g. "has:attachment". */
	insert: string;
	icon?: React.ReactElement;
	color?: string;
}

/**
 * The panel under the search box while it has focus: quick filters as
 * chips, then recent searches matching what's typed (Enter still searches).
 */
export function SearchSuggestions({
	value,
	recent,
	tips,
	onPick,
	onInsert,
	onRemove,
}: {
	value: string;
	recent: string[];
	tips?: SearchTip[];
	onPick: (q: string) => void;
	onInsert: (token: string) => void;
	onRemove: (q: string) => void;
}) {
	const q = value.trim().toLowerCase();
	const matches = recent.filter((r) => !q || (r.toLowerCase().includes(q) && r.toLowerCase() !== q));
	if (!matches.length && !tips?.length) return null;
	return (
		<Paper
			elevation={6}
			// Keep focus in the field while choosing.
			onMouseDown={(e) => e.preventDefault()}
			sx={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: (t) => t.zIndex.modal, borderRadius: 3, overflow: "hidden", py: 1 }}
		>
			{tips?.length ? (
				<Box sx={{ px: 2, pb: matches.length ? 1 : 0.5 }}>
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75, fontWeight: 600 }}>
						Narrow it down
					</Typography>
					<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
						{tips.map((t) => (
							<Chip
								key={t.label}
								label={t.label}
								icon={t.icon}
								size="small"
								variant="outlined"
								onClick={() => onInsert(t.insert)}
								sx={t.color ? { "& .MuiChip-icon": { color: t.color } } : undefined}
							/>
						))}
					</Box>
				</Box>
			) : null}
			{matches.length > 0 && (
				<List dense disablePadding aria-label="Recent searches">
					{matches.map((r) => (
						<ListItemButton key={r} onClick={() => onPick(r)} sx={{ borderRadius: 0, pr: 1 }}>
							<ListItemIcon sx={{ minWidth: 36 }}>
								<HistoryIcon fontSize="small" />
							</ListItemIcon>
							<ListItemText primary={r} slotProps={{ primary: { noWrap: true } }} />
							<IconButton
								size="small"
								aria-label={`Remove "${r}" from recent searches`}
								onClick={(e) => {
									e.stopPropagation();
									onRemove(r);
								}}
							>
								<CloseIcon fontSize="small" />
							</IconButton>
						</ListItemButton>
					))}
				</List>
			)}
		</Paper>
	);
}
