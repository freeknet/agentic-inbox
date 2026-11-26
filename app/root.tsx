// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import CssBaseline from "@mui/material/CssBaseline";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import Stack from "@mui/material/Stack";
import { ThemeProvider } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import CloudOffIcon from "@mui/icons-material/CloudOffOutlined";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";
import { ApiError } from "~/services/api";
import { ConfirmHost } from "~/lib/confirm";
import { Toaster } from "~/lib/toast";
import PreferencesApplier from "~/components/PreferencesApplier";
import { theme } from "~/theme";
import { PwaHead, PwaSupport } from "~/shell/pwa";
import "./index.css";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				refetchOnWindowFocus: false,
				retry: (failureCount, error) => {
					// Don't retry 4xx errors (not found, unauthorized, etc.)
					if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
						return false;
					}
					return failureCount < 2;
				},
			},
		},
		mutationCache: new MutationCache({
			onError: (error) => {
				// Global fallback for mutations that don't handle errors themselves.
				console.error("Mutation failed:", error);
			},
		}),
	});
}

// Lazy singleton for the browser — avoids module-scope instantiation that
// leaks cache across SSR requests.
let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
	if (typeof window === "undefined") {
		// SSR: always create a fresh client per request to prevent cross-user cache leaks
		return makeQueryClient();
	}
	// Browser: reuse the same client across navigations
	if (!browserQueryClient) browserQueryClient = makeQueryClient();
	return browserQueryClient;
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="UTF-8" />
				<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
				<link
					rel="icon"
					type="image/x-icon"
					href="/favicon.ico"
					sizes="48x48 32x32 16x16"
				/>
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta name="color-scheme" content="light dark" />
				<title>Agentic Inbox</title>
				<PwaHead title="Mail" />
				<Meta />
				<Links />
			</head>
			<body>
				<InitColorSchemeScript attribute="class" defaultMode="system" />
				<ThemeProvider theme={theme} defaultMode="system">
					<CssBaseline enableColorScheme />
					<PreferencesApplier />
					{children}
					<Toaster />
					<ConfirmHost />
				</ThemeProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export function HydrateFallback() {
	return (
		<Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
			<CircularProgress />
		</Box>
	);
}

export default function App() {
	// Use useState to ensure each SSR request gets a fresh client while the
	// browser reuses the same singleton across navigations.
	const [queryClient] = useState(getQueryClient);
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
			<PwaSupport name="Mail" shareLanding="/compose" />
		</QueryClientProvider>
	);
}

export function ErrorBoundary({ error }: { error: unknown }) {
	let title = "Something went wrong";
	let description = "An unexpected error occurred. Please try again.";
	let status: number | null = null;

	if (isRouteErrorResponse(error)) {
		status = error.status;
		if (error.status === 404) {
			title = "Page not found";
			description = "The page you're looking for doesn't exist or has been moved.";
		} else {
			title = `Error ${error.status}`;
			description = error.statusText || description;
		}
	} else if (error instanceof Error && import.meta.env.DEV) {
		description = error.message;
	}

	return (
		<Stack
			spacing={2}
			sx={{
				minHeight: "100dvh",
				alignItems: "center",
				justifyContent: "center",
				p: 4,
				textAlign: "center",
			}}
		>
			<CloudOffIcon sx={{ fontSize: 64, color: "text.secondary" }} />
			<Typography variant="h6">{status === 404 ? "404 — Page not found" : title}</Typography>
			<Typography color="text.secondary">{description}</Typography>
			<Button
				variant="contained"
				onClick={() => {
					window.location.href = "/";
				}}
			>
				Go Home
			</Button>
		</Stack>
	);
}
