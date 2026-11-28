// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Fade from "@mui/material/Fade";
import { type ReactNode, useEffect, useRef, useState } from "react";
import ComposePanel from "~/components/ComposePanel";
import EmailPanel from "~/components/EmailPanel";
import { DEFAULT_PREFS, usePrefs } from "~/lib/prefs";
import { ResizeHandle } from "~/shell/Resizer";

interface MailboxSplitViewProps {
	selectedEmailId: string | null;
	isComposing: boolean;
	children: ReactNode;
}

/**
 * The message list and the reading pane, as two cards (Drive's surfaces).
 * Settings → Reading pane puts the pane on the right, below the list, or
 * nowhere (the message replaces the list, as on phones). The split between
 * them can be dragged; double-click it to reset.
 */
export default function MailboxSplitView({ selectedEmailId, isComposing, children }: MailboxSplitViewProps) {
	const isPanelOpen = selectedEmailId !== null || isComposing;
	const pane = usePrefs((p) => p.readingPane);
	const listWidth = usePrefs((p) => p.listWidth);
	const listHeight = usePrefs((p) => p.listHeight);
	const setPref = usePrefs((p) => p.set);

	// The list can't crowd the message out: cap it by the space actually there.
	const box = useRef<HTMLDivElement>(null);
	const [room, setRoom] = useState({ w: 0, h: 0 });
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => setRoom({ w: entry.contentRect.width, h: entry.contentRect.height }));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const maxW = room.w ? Math.max(280, room.w - 376) : 900;
	const maxH = room.h ? Math.max(140, room.h - 216) : 900;
	const width = Math.min(listWidth, maxW);
	const height = Math.min(listHeight, maxH);

	const card = { bgcolor: "background.paper", borderRadius: { md: 3 }, overflow: "hidden" } as const;
	const below = pane === "below";
	// With no split, or on phones, an open message takes the whole area.
	const replace = pane === "off";
	const split = isPanelOpen && !replace;

	const panel = (
		<>
			{isComposing && !selectedEmailId ? (
				<ComposePanel />
			) : isComposing && selectedEmailId ? (
				<Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
					<ComposePanel />
					{/* Phones: compose alone, full screen; the message is back when it closes. */}
					<Box sx={{ display: { xs: "none", md: "block" } }}>
						<Divider />
						<EmailPanel emailId={selectedEmailId} />
					</Box>
				</Box>
			) : selectedEmailId ? (
				<EmailPanel emailId={selectedEmailId} />
			) : null}
		</>
	);

	return (
		<Box ref={box} sx={{ display: "flex", flexDirection: below ? { xs: "row", md: "column" } : "row", height: "100%", gap: { xs: 0, md: split ? 0 : 2 } }}>
			<Box
				sx={{
					...card,
					display: isPanelOpen ? { xs: "none", md: replace ? "none" : "flex" } : "flex",
					flexDirection: "column",
					minWidth: 0,
					minHeight: 0,
					flexShrink: 0,
					...(split && !below && { width: { md: width } }),
					...(split && below && { height: { md: height } }),
					...(!split && { flex: 1, width: "100%" }),
				}}
			>
				{children}
			</Box>
			{split && (
				<Box sx={{ display: { xs: "none", md: "flex" } }}>
					<ResizeHandle
						axis={below ? "y" : "x"}
						label={below ? "Resize message list height" : "Resize message list width"}
						value={below ? height : width}
						min={below ? 140 : 280}
						max={below ? maxH : maxW}
						onChange={(v) => setPref(below ? "listHeight" : "listWidth", v)}
						onReset={() => setPref(below ? "listHeight" : "listWidth", below ? DEFAULT_PREFS.listHeight : DEFAULT_PREFS.listWidth)}
					/>
				</Box>
			)}
			{isPanelOpen && (
				<Box sx={{ ...card, flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
					{/* Each message fades in as it opens. */}
					<Fade in appear key={selectedEmailId ?? "compose"} timeout={200}>
						<Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{panel}</Box>
					</Fade>
				</Box>
			)}
		</Box>
	);
}
