// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearCompose } from "~/lib/composeRestore";
import type { Email } from "~/types";
import type { ComposePrefill } from "~/lib/mailto";

export type ComposeMode = "new" | "reply" | "reply-all" | "forward";

export interface ComposeOptions {
	mode: ComposeMode;
	originalEmail?: Email | null;
	/** When editing a draft, this holds the draft email to pre-fill the composer */
	draftEmail?: Email | null;
	/** Fields of an unsent message brought back after a refresh (lib/composeRestore). */
	restored?: { to: string; cc: string; bcc: string; subject: string; body: string };
	/** A new message's fields from a mailto: link or a share (see routes/launch.tsx). */
	prefill?: ComposePrefill;
}

interface UIState {
	// Side panel state
	selectedEmailId: string | null;
	isComposing: boolean;
	_previousEmailId: string | null;
	selectEmail: (id: string | null) => void;
	startCompose: (options?: ComposeOptions) => void;
	closePanel: () => void;
	closeCompose: () => void;

	// Compose options
	composeOptions: ComposeOptions;

	// Mobile sidebar
	isSidebarOpen: boolean;
	openSidebar: () => void;
	closeSidebar: () => void;
	toggleSidebar: () => void;

	// Agent panel
	isAgentPanelOpen: boolean;
	/** Keyboard shortcuts help ("?") and command palette (Ctrl+K). */
	isShortcutsOpen: boolean;
	setShortcutsOpen: (open: boolean) => void;
	isPaletteOpen: boolean;
	setPaletteOpen: (open: boolean) => void;
	toggleAgentPanel: () => void;

	// Legacy dialog support (kept for non-split views)
	isComposeModalOpen: boolean;
	openComposeModal: (options?: ComposeOptions) => void;
	closeComposeModal: () => void;
}

export const useUIStore = create<UIState>()(
	persist(
		(set, get) => ({
	selectedEmailId: null,
	isComposing: false,
	_previousEmailId: null,
	composeOptions: { mode: "new", originalEmail: null },
	isComposeModalOpen: false,
	isSidebarOpen: false,
	// Closed by default, like Drive's details panel; the header button opens it.
	isAgentPanelOpen: false,
	isShortcutsOpen: false,
	setShortcutsOpen: (isShortcutsOpen) => set({ isShortcutsOpen }),
	isPaletteOpen: false,
	setPaletteOpen: (isPaletteOpen) => set({ isPaletteOpen }),

	selectEmail: (id) => set({ selectedEmailId: id, isComposing: false }),

	startCompose: (options) =>
		set((state) => {
			const mode = options?.mode || "new";
			const isReplyOrForward = mode === "reply" || mode === "reply-all" || mode === "forward";
			return {
				isComposing: true,
				_previousEmailId: state.selectedEmailId,
				// Keep selectedEmailId when replying/forwarding so the thread stays visible
				selectedEmailId: isReplyOrForward ? state.selectedEmailId : null,
				composeOptions: options || { mode: "new", originalEmail: null },
				isSidebarOpen: false,
			};
		}),

	closePanel: () => {
		if (get().isComposing) clearCompose();
		set({ selectedEmailId: null, isComposing: false, _previousEmailId: null, composeOptions: { mode: "new" as const, originalEmail: null } });
	},

	closeCompose: () =>
		set((state) => (clearCompose(), {
			isComposing: false,
			selectedEmailId: state._previousEmailId,
			_previousEmailId: null,
			composeOptions: { mode: "new" as const, originalEmail: null },
		})),

	openSidebar: () => set({ isSidebarOpen: true }),
	closeSidebar: () => set({ isSidebarOpen: false }),
	toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),

	toggleAgentPanel: () => set({ isAgentPanelOpen: !get().isAgentPanelOpen }),

	openComposeModal: (options) =>
		set({
			composeOptions: options || { mode: "new", originalEmail: null },
			isComposeModalOpen: true,
		}),

	closeComposeModal: () =>
		set({
			isComposeModalOpen: false,
			composeOptions: { mode: "new", originalEmail: null },
		}),
		}),
		{
			// Only the agent panel's open/closed state is remembered; the open
			// message is in the URL and an unsent message in sessionStorage.
			name: "mail-ui",
			partialize: (s) => ({ isAgentPanelOpen: s.isAgentPanelOpen }),
			// Loaded after the first render (mailbox layout) so it matches the server's HTML.
			skipHydration: true,
		},
	),
);
