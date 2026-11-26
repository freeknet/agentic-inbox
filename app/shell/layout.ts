// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Shell layout choices that stick per browser (each app has its own origin, so its own copy). */
interface ShellLayout {
	/** Desktop sidebar shrunk to an icon rail (the header's menu button toggles it, as in Gmail). */
	sidebarCollapsed: boolean;
	setSidebarCollapsed: (v: boolean) => void;
}

export const useShellLayout = create<ShellLayout>()(
	persist(
		(set) => ({
			sidebarCollapsed: false,
			setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
		}),
		// Loaded after the first render (SidebarFrame) so it matches the server's HTML.
		{ name: "shell-layout", skipHydration: true, partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
	),
);

/** MUI's md breakpoint: below it the sidebar is a drawer. */
const DESKTOP = "(min-width: 900px)";

/**
 * The header menu button: collapses or expands the sidebar on desktop, opens
 * the drawer on phones.
 */
export function toggleSidebar(openDrawer: () => void) {
	if (typeof window !== "undefined" && window.matchMedia(DESKTOP).matches) {
		const s = useShellLayout.getState();
		s.setSidebarCollapsed(!s.sidebarCollapsed);
	} else {
		openDrawer();
	}
}
