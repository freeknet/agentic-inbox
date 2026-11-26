// Shared shell: keep identical in agentic-inbox and agentic-drive (app/shell/).
//
// Installable-app support for both apps: service worker registration and the
// "new version" prompt, the install button, the offline notice, the title-bar
// colour, and helpers for the share target, file handling and the app badge.
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";

/** Title-bar colours: theme.ts `background.default` for each scheme. */
const THEME_COLOR = { light: "#f8fafd", dark: "#1b1b1b" } as const;

/** <head> tags for the installed app; render inside <head> in root.tsx. */
export function PwaHead({ title }: { title: string }) {
	return (
		<>
			{/* Access protects the manifest too, so it must be fetched with the session cookie. */}
			<link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
			<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
			<meta name="theme-color" content={THEME_COLOR.light} media="(prefers-color-scheme: light)" />
			<meta name="theme-color" content={THEME_COLOR.dark} media="(prefers-color-scheme: dark)" />
			<meta name="mobile-web-app-capable" content="yes" />
			<meta name="apple-mobile-web-app-capable" content="yes" />
			<meta name="apple-mobile-web-app-title" content={title} />
			<meta name="apple-mobile-web-app-status-bar-style" content="default" />
		</>
	);
}

// ── Install prompt ──────────────────────────────────────────────────────────

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let installEvent: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((fn) => fn());
if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", (e) => {
		e.preventDefault();
		installEvent = e as InstallPromptEvent;
		emitInstall();
	});
	window.addEventListener("appinstalled", () => {
		installEvent = null;
		emitInstall();
	});
}

/** Opens the browser's install dialog, or null when the app can't be installed from here. */
export function useInstallPrompt(): (() => Promise<void>) | null {
	const event = useSyncExternalStore(
		(fn) => {
			installListeners.add(fn);
			return () => installListeners.delete(fn);
		},
		() => installEvent,
		() => null,
	);
	if (!event) return null;
	return async () => {
		await event.prompt();
		await event.userChoice.catch(() => null);
		installEvent = null;
		emitInstall();
	};
}

/** Header button shown only while the browser offers installation. */
export function InstallButton({ name }: { name: string }) {
	const install = useInstallPrompt();
	if (!install) return null;
	return (
		<Tooltip title={`Install ${name}`}>
			<IconButton aria-label={`Install ${name}`} onClick={install}>
				<InstallDesktopOutlinedIcon />
			</IconButton>
		</Tooltip>
	);
}

// ── Service worker, updates, offline, title bar ────────────────────────────

/**
 * Registers the service worker and shows the app-level notices: a new version
 * is ready (reload to use it) and you're offline. Render once, inside the router.
 * `shareLanding` is where shared files and text land (the page reads ?share=).
 */
export function PwaSupport({ name, shareLanding }: { name: string; shareLanding: string }) {
	const navigate = useNavigate();
	const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
	const [offline, setOffline] = useState(false);
	const reloading = useRef(false);
	const { colorScheme } = useColorScheme();

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		const sw = navigator.serviceWorker;
		let registration: ServiceWorkerRegistration | undefined;
		let timer: ReturnType<typeof setInterval> | undefined;

		const watch = (reg: ServiceWorkerRegistration) => {
			// Only an update needs a prompt; the first install has no controller.
			if (reg.waiting && sw.controller) setWaiting(reg.waiting);
			reg.addEventListener("updatefound", () => {
				const next = reg.installing;
				next?.addEventListener("statechange", () => {
					if (next.state === "installed" && sw.controller) setWaiting(next);
				});
			});
		};
		const check = () => {
			if (document.visibilityState === "visible") registration?.update().catch(() => {});
		};

		const url = `/sw.js?${new URLSearchParams({ name, share: shareLanding })}`;
		sw.register(url, { scope: "/" })
			.then((reg) => {
				registration = reg;
				watch(reg);
				timer = setInterval(check, 60 * 60 * 1000);
			})
			.catch((e) => console.warn("Service worker registration failed:", e));

		const onController = () => {
			if (reloading.current) window.location.reload();
		};
		const onMessage = (e: MessageEvent) => {
			if (e.data?.type !== "OPEN_URL" || typeof e.data.url !== "string") return;
			const target = new URL(e.data.url, window.location.origin);
			if (target.origin === window.location.origin) navigate(target.pathname + target.search + target.hash);
		};
		sw.addEventListener("controllerchange", onController);
		sw.addEventListener("message", onMessage);
		document.addEventListener("visibilitychange", check);
		return () => {
			clearInterval(timer);
			sw.removeEventListener("controllerchange", onController);
			sw.removeEventListener("message", onMessage);
			document.removeEventListener("visibilitychange", check);
		};
	}, [name, shareLanding, navigate]);

	useEffect(() => {
		const update = () => setOffline(!navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);

	// The installed window's title bar follows the in-app theme, not just the OS.
	useEffect(() => {
		if (!colorScheme) return;
		for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
			meta.content = colorScheme === "dark" ? THEME_COLOR.dark : THEME_COLOR.light;
		}
	}, [colorScheme]);

	return (
		<>
			<Snackbar
				open={!!waiting}
				message={`A new version of ${name} is ready`}
				anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
				action={
					<>
						<Button color="inherit" size="small" onClick={() => setWaiting(null)}>
							Later
						</Button>
						<Button
							color="primary"
							size="small"
							variant="contained"
							onClick={() => {
								reloading.current = true;
								waiting?.postMessage({ type: "SKIP_WAITING" });
							}}
						>
							Reload
						</Button>
					</>
				}
			/>
			<Snackbar
				open={offline && !waiting}
				message="You're offline. Changes won't save until you reconnect."
				anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
			/>
		</>
	);
}

// ── Share target, file handling, badge ─────────────────────────────────────

export interface SharedItems {
	title: string;
	text: string;
	url: string;
	files: File[];
}

/** Reads (and removes) what the service worker stored for a share, or null if it's gone. */
export async function takeShare(id: string): Promise<SharedItems | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id) || typeof caches === "undefined") return null;
	const cache = await caches.open("share-target");
	const metaKey = `/__share/${id}/meta`;
	const metaRes = await cache.match(metaKey);
	if (!metaRes) return null;
	const meta = (await metaRes.json()) as { title: string; text: string; url: string; files: string[] };
	const files: File[] = [];
	for (const key of meta.files) {
		const res = await cache.match(key);
		if (res) {
			const name = decodeURIComponent(res.headers.get("x-filename") || "file");
			files.push(new File([await res.blob()], name, { type: res.headers.get("content-type") || "" }));
		}
		await cache.delete(key);
	}
	await cache.delete(metaKey);
	return { title: meta.title, text: meta.text, url: meta.url, files };
}

type LaunchParams = { files?: { getFile: () => Promise<File> }[]; targetURL?: string };
type LaunchQueue = { setConsumer: (fn: (params: LaunchParams) => void) => void };

/** Files opened with the installed app from the OS ("Open with"). */
export function useLaunchFiles(onFiles: (files: File[]) => void) {
	const handler = useRef(onFiles);
	handler.current = onFiles;
	useEffect(() => {
		const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
		queue?.setConsumer(async (params) => {
			if (!params.files?.length) return;
			const files = await Promise.all(params.files.map((h) => h.getFile()));
			handler.current(files);
		});
	}, []);
}

/** The number on the installed app's icon; 0 clears it. */
export function setAppBadge(count: number) {
	const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
	if (!nav.setAppBadge) return;
	(count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge!()).catch(() => {});
}
