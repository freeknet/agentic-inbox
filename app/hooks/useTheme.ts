import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const KEY = "inbox-theme";

/**
 * Runs inline in <head> before first paint so a dark-mode user never sees a
 * light flash. Kumo's semantic tokens switch on data-mode (light-dark()).
 */
export const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.mode=d?"dark":"light";}catch(e){document.documentElement.dataset.mode="light";}})();`;

function readPreference(): ThemePreference {
	try {
		const v = localStorage.getItem(KEY);
		return v === "light" || v === "dark" ? v : "system";
	} catch {
		return "system";
	}
}

function apply(pref: ThemePreference) {
	const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.dataset.mode = dark ? "dark" : "light";
}

export function useTheme() {
	const [preference, setPreference] = useState<ThemePreference>("system");

	useEffect(() => {
		setPreference(readPreference());
	}, []);

	// Follow the OS setting while the preference is "system".
	useEffect(() => {
		apply(preference);
		if (preference !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => apply("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [preference]);

	const cycle = useCallback(() => {
		setPreference((p) => {
			const next: ThemePreference = p === "system" ? "light" : p === "light" ? "dark" : "system";
			try {
				localStorage.setItem(KEY, next);
			} catch {
				// Private mode: the choice lasts for this page only.
			}
			return next;
		});
	}, []);

	return { preference, cycle };
}
