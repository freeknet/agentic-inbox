import { useColorScheme } from "@mui/material/styles";
import { useCallback } from "react";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Light/dark/system preference, backed by MUI's color-scheme handling.
 * InitColorSchemeScript in the root layout applies it before first paint, so
 * a dark-mode user never sees a light flash.
 */
export function useTheme() {
	const { mode, setMode } = useColorScheme();
	const preference = (mode as ThemePreference | undefined) ?? "system";

	const cycle = useCallback(() => {
		setMode(preference === "system" ? "light" : preference === "light" ? "dark" : "system");
	}, [preference, setMode]);

	return { preference, cycle };
}
