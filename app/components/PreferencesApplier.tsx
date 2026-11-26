import { useEffect } from "react";
import { ACCENTS, FONT_SIZES, usePrefs } from "~/lib/prefs";

/** "#0b57d0" → "11 87 208", the channel format MUI's alpha() reads. */
function channel(hex: string): string {
	const n = Number.parseInt(hex.slice(1), 16);
	return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** A darker shade for hover on contained buttons (MUI's `primary.dark`). */
function darken(hex: string, amount = 0.2): string {
	const n = Number.parseInt(hex.slice(1), 16);
	const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - amount)));
	return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const BLUE = ACCENTS.blue;

/**
 * Writes the appearance preferences to the document, so the MUI theme picks
 * them up without rebuilding the theme on every change. Only the app's own
 * variables are set inline; the palette variables are mapped in the stylesheet
 * below, which outranks MUI's `.light` / `.dark` rules. MUI tints (hover,
 * selected rows) come from the `*Channel` variables, so those follow the
 * accent too. Every mapping falls back to blue, so the server-rendered page
 * is styled before this effect runs.
 */
export default function PreferencesApplier() {
	const accent = usePrefs((p) => p.accent);
	const fontSize = usePrefs((p) => p.fontSize);
	const density = usePrefs((p) => p.density);

	useEffect(() => {
		void usePrefs.persist.rehydrate();
	}, []);

	useEffect(() => {
		const root = document.documentElement;
		const p = ACCENTS[accent] ?? BLUE;
		const vars: Record<string, string> = {
			"--app-accent": p.light,
			"--app-accent-channel": channel(p.light),
			"--app-accent-darker": darken(p.light),
			"--app-accent-darker-channel": channel(darken(p.light)),
			"--app-accent-soft": p.lightSoft,
			"--app-accent-soft-channel": channel(p.lightSoft),
			"--app-accent-dark": p.dark,
			"--app-accent-dark-channel": channel(p.dark),
			"--app-accent-dark-darker": darken(p.dark, 0.15),
			"--app-accent-dark-darker-channel": channel(darken(p.dark, 0.15)),
			"--app-accent-dark-soft": p.darkSoft,
			"--app-accent-dark-soft-channel": channel(p.darkSoft),
		};
		for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
		root.dataset.accent = accent;
		root.dataset.density = density;
		root.style.fontSize = FONT_SIZES[fontSize]?.root ?? "16px";
	}, [accent, fontSize, density]);

	return (
		<style>{`
			html.light {
				--mui-palette-primary-main: var(--app-accent, ${BLUE.light});
				--mui-palette-primary-mainChannel: var(--app-accent-channel, ${channel(BLUE.light)});
				--mui-palette-primary-dark: var(--app-accent-darker, ${darken(BLUE.light)});
				--mui-palette-primary-darkChannel: var(--app-accent-darker-channel, ${channel(darken(BLUE.light))});
				--mui-palette-primary-light: var(--app-accent-soft, ${BLUE.lightSoft});
				--mui-palette-primary-lightChannel: var(--app-accent-soft-channel, ${channel(BLUE.lightSoft)});
				--mui-palette-primary-contrastText: #ffffff;
			}
			html.dark {
				--mui-palette-primary-main: var(--app-accent-dark, ${BLUE.dark});
				--mui-palette-primary-mainChannel: var(--app-accent-dark-channel, ${channel(BLUE.dark)});
				--mui-palette-primary-dark: var(--app-accent-dark-darker, ${darken(BLUE.dark, 0.15)});
				--mui-palette-primary-darkChannel: var(--app-accent-dark-darker-channel, ${channel(darken(BLUE.dark, 0.15))});
				--mui-palette-primary-light: var(--app-accent-dark-soft, ${BLUE.darkSoft});
				--mui-palette-primary-lightChannel: var(--app-accent-dark-soft-channel, ${channel(BLUE.darkSoft)});
				--mui-palette-primary-contrastText: #062e6f;
			}
			html[data-density="compact"] .mail-row {
				padding-top: 6px;
				padding-bottom: 6px;
			}
		`}</style>
	);
}
