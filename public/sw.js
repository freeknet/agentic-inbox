// Shared service worker: keep identical in agentic-inbox and agentic-drive (public/sw.js).
//
// What it does:
// - Pages: network first (Cloudflare Access redirects pass straight through),
//   with an offline page when there is no connection.
// - Built assets (/assets/*, content-hashed) and icons: cache first.
// - Google Fonts (stylesheet and font files): cache first, so text keeps
//   its typeface offline.
// - API calls and everything else: untouched, never cached.
// - Share target: files and text shared to the installed app are POSTed to
//   /share-target; they are held in a cache and the app picks them up from
//   the landing page given as ?share= on this script's URL.
// - Push: shows the notification the server sent, sets the app badge, and
//   opens or focuses the app on click.
// Registered by PwaSupport (app/shell/pwa.tsx) as /sw.js?name=…&share=….

const VERSION = 1;
const ASSET_CACHE = `assets-v${VERSION}`;
const SHARE_CACHE = "share-target";
const FONT_CACHE = "fonts-v1";
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const MAX_ASSETS = 300;

const params = new URL(self.location.href).searchParams;
const APP_NAME = params.get("name") || "App";
const SHARE_LANDING = params.get("share") || "/";

self.addEventListener("install", (event) => {
	// A first install activates at once; an update waits until the page asks
	// (the "new version" prompt), so an open page never runs mixed versions.
	// The offline page shows the app icon, so keep it (best effort).
	event.waitUntil(
		caches
			.open(ASSET_CACHE)
			.then((cache) => cache.add("/icons/icon-192.png"))
			.catch(() => {}),
	);
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keep = new Set([ASSET_CACHE, SHARE_CACHE, FONT_CACHE]);
			for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
			if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method === "GET" && FONT_HOSTS.has(url.hostname)) {
		event.respondWith(cacheFirst(request, FONT_CACHE));
		return;
	}
	if (url.origin !== self.location.origin) return;

	if (request.method === "POST" && url.pathname === "/share-target") {
		event.respondWith(receiveShare(request));
		return;
	}
	if (request.method !== "GET") return;

	if (request.mode === "navigate") {
		event.respondWith(page(event));
		return;
	}
	if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
		event.respondWith(cacheFirst(request));
	}
});

async function page(event) {
	try {
		const preloaded = await event.preloadResponse;
		if (preloaded) return preloaded;
		return await fetch(event.request);
	} catch {
		return offlinePage();
	}
}

async function cacheFirst(request, name = ASSET_CACHE) {
	const cache = await caches.open(name);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	// Only keep real files: an Access sign-in redirect or an error must not stick.
	if (response.ok && (response.type === "basic" || response.type === "cors")) {
		await cache.put(request, response.clone());
		trim(cache);
	}
	return response;
}

async function trim(cache) {
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

async function receiveShare(request) {
	const form = await request.formData();
	const id = crypto.randomUUID();
	const cache = await caches.open(SHARE_CACHE);
	const text = (name) => {
		const v = form.get(name);
		return typeof v === "string" ? v : "";
	};
	const meta = { title: text("title"), text: text("text"), url: text("url"), files: [], at: Date.now() };
	let n = 0;
	for (const file of form.getAll("files")) {
		if (typeof file === "string") continue;
		const key = `/__share/${id}/${n++}`;
		await cache.put(
			key,
			new Response(file, {
				headers: { "content-type": file.type || "application/octet-stream", "x-filename": encodeURIComponent(file.name || "file") },
			}),
		);
		meta.files.push(key);
	}
	await cache.put(`/__share/${id}/meta`, Response.json(meta));
	const sep = SHARE_LANDING.includes("?") ? "&" : "?";
	return Response.redirect(`${SHARE_LANDING}${sep}share=${id}`, 303);
}

self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : "" };
	}
	const jobs = [
		self.registration.showNotification(data.title || APP_NAME, {
			body: data.body || "",
			tag: data.tag,
			icon: "/icons/icon-192.png",
			badge: "/icons/badge-96.png",
			timestamp: data.timestamp || Date.now(),
			data: { url: data.url || "/" },
		}),
	];
	if (typeof data.badge === "number" && self.navigator.setAppBadge) {
		jobs.push((data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {}));
	}
	event.waitUntil(Promise.all(jobs));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
			if (open) {
				await open.focus();
				// Let the app route in place; a full navigation is the fallback.
				open.postMessage({ type: "OPEN_URL", url: target });
				return;
			}
			await self.clients.openWindow(target);
		})(),
	);
});

function offlinePage() {
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${APP_NAME} is offline</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f8fafd;color:#1f1f1f}
@media (prefers-color-scheme:dark){body{background:#1b1b1b;color:#e3e3e3}p{color:#a8a8a8}}
main{text-align:center;padding:24px}img{width:72px;height:72px;opacity:.9}h1{font-size:22px;font-weight:400;margin:16px 0 4px}p{margin:0 0 24px;color:#5f6368}
button{font:inherit;font-weight:500;border:0;border-radius:999px;padding:10px 24px;background:#0b57d0;color:#fff;cursor:pointer}</style></head>
<body><main><img src="/icons/icon-192.png" alt=""><h1>You're offline</h1><p>${APP_NAME} will reload when you're back online.</p><button onclick="location.reload()">Try again</button></main>
<script>addEventListener("online",()=>location.reload())</script></body></html>`;
	return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
