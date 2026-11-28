import { createTheme } from "@mui/material/styles";

/**
 * Material Design 3 theme shared by Mail and Drive. Keep this file identical
 * in agentic-inbox and agentic-drive (app/theme.ts) so the two apps look like
 * one product. Light and dark schemes are CSS variables switched by a class
 * on <html>, set before paint by InitColorSchemeScript.
 *
 * Surfaces: the shell (header, sidebar) sits on `background.default`; the
 * main content is a card on `background.paper`.
 *
 * Corners: shape.borderRadius is 4px, so `borderRadius: 2` in sx is 8px,
 * 3 is 12px and 4 is 16px. Controls use 8px, cards 12–16px, dialogs 16px;
 * only avatars, icon buttons and badges are fully round.
 */
export const theme = createTheme({
	cssVariables: { colorSchemeSelector: "class" },
	colorSchemes: {
		light: {
			palette: {
				primary: { main: "#0b57d0", light: "#d3e3fd", contrastText: "#ffffff" },
				secondary: { main: "#c2e7ff", contrastText: "#001d35" },
				background: { default: "#f8fafd", paper: "#ffffff" },
				text: { primary: "#1f1f1f", secondary: "#444746" },
				divider: "#e1e3e1",
				action: { hover: "rgba(68,71,70,0.08)", selected: "#c2e7ff" },
				error: { main: "#b3261e" },
				warning: { main: "#a15c00" },
				success: { main: "#1e7b34" },
				info: { main: "#0b57d0" },
			},
		},
		dark: {
			palette: {
				primary: { main: "#a8c7fa", light: "#004a77", contrastText: "#062e6f" },
				secondary: { main: "#004a77", contrastText: "#c2e7ff" },
				background: { default: "#1b1b1b", paper: "#131314" },
				text: { primary: "#e3e3e3", secondary: "#c4c7c5" },
				divider: "#444746",
				action: { hover: "rgba(227,227,227,0.08)", selected: "#004a77" },
				error: { main: "#f2b8b5" },
				warning: { main: "#fdd663" },
				success: { main: "#81c995" },
				info: { main: "#a8c7fa" },
			},
		},
	},
	shape: { borderRadius: 4 },
	typography: {
		fontFamily: '"Google Sans", "Roboto", "Segoe UI", system-ui, -apple-system, sans-serif',
		button: { textTransform: "none", fontWeight: 500, letterSpacing: 0.1 },
		h6: { fontWeight: 400, fontSize: "1.375rem" },
		subtitle2: { fontWeight: 600, letterSpacing: 0.1 },
		body2: { fontSize: "0.875rem" },
		caption: { letterSpacing: 0.2 },
	},
	components: {
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: { root: { borderRadius: 8, paddingInline: 16 } },
		},
		MuiButtonGroup: { styleOverrides: { root: { borderRadius: 8 } } },
		MuiIconButton: { styleOverrides: { root: { borderRadius: 999 } } },
		MuiFab: { styleOverrides: { root: { borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,.2), 0 4px 8px 3px rgba(0,0,0,.12)" } } },
		MuiToggleButton: {
			styleOverrides: {
				root: {
					borderRadius: 8,
					textTransform: "none",
					// M3 segmented button: the chosen segment is a clear tonal fill.
					"&.Mui-selected, &.Mui-selected:hover": {
						backgroundColor: "var(--mui-palette-secondary-main)",
						color: "var(--mui-palette-secondary-contrastText)",
						fontWeight: 600,
					},
				},
			},
		},
		MuiToggleButtonGroup: { styleOverrides: { root: { borderRadius: 8 } } },
		MuiMenu: { defaultProps: { slotProps: { paper: { elevation: 3 } } }, styleOverrides: { paper: { borderRadius: 8 } } },
		MuiPopover: { styleOverrides: { paper: { borderRadius: 12 } } },
		MuiMenuItem: { styleOverrides: { root: { minHeight: 40, gap: 8 } } },
		MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
		MuiListItemButton: { styleOverrides: { root: { borderRadius: 8 } } },
		MuiTooltip: { defaultProps: { enterDelay: 400 }, styleOverrides: { tooltip: { borderRadius: 4 } } },
		MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { borderRadius: 12 } } },
		MuiChip: { styleOverrides: { root: { borderRadius: 8 } } },
		MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8 } } },
		MuiLinearProgress: { styleOverrides: { root: { borderRadius: 4 }, bar: { borderRadius: 4 } } },
		MuiBadge: { styleOverrides: { badge: { fontWeight: 600 } } },
		MuiAppBar: {
			defaultProps: { elevation: 0, color: "transparent" },
			styleOverrides: { root: { backgroundImage: "none" } },
		},
		MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0, paddingInline: 4 } } },
		// A clear ring on whatever has keyboard focus (mouse clicks don't show it).
		MuiButtonBase: {
			styleOverrides: {
				root: { "&.Mui-focusVisible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 } },
			},
		},
		MuiCssBaseline: {
			styleOverrides: {
				body: { margin: 0 },
				// Message rows, as in Gmail: unread on the brighter surface, read on a quieter one.
				":root": { "--row-unread-bg": "#ffffff", "--row-read-bg": "#f2f6fc" },
				":root.dark": { "--row-unread-bg": "#232425", "--row-read-bg": "#131314" },
				"a:focus-visible, [tabindex]:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 },
				"::selection": { background: "color-mix(in srgb, var(--mui-palette-primary-main) 30%, transparent)" },
			},
		},
	},
});

/**
 * The rainbow accents both apps use for folders, sections and decoration:
 * Google's four plus four companions, readable on light and dark.
 */
export const RAINBOW = ["#4285f4", "#ea4335", "#fbbc04", "#34a853", "#a142f4", "#24c1e0", "#fa7b17", "#f538a0"] as const;

/** A steady rainbow colour for any id or name. */
export function rainbowFor(key: string): string {
	let h = 0;
	for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return RAINBOW[h % RAINBOW.length];
}

/** The full spectrum, for borders and bars. */
export const RAINBOW_GRADIENT = "linear-gradient(90deg, #4285f4, #a142f4, #f538a0, #ea4335, #fa7b17, #fbbc04, #34a853, #24c1e0)";
export const RAINBOW_CONIC = "conic-gradient(from 180deg, #4285f4, #a142f4, #f538a0, #ea4335, #fa7b17, #fbbc04, #34a853, #24c1e0, #4285f4)";
