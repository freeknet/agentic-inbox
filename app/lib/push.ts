import { useCallback, useEffect, useState } from "react";
import api from "~/services/api";

/**
 * New-mail notifications on this device, through the installed app's
 * service worker. The browser keeps the subscription; the server keeps a copy
 * per mailbox so it knows where to push.
 */

const supported = () =>
	typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
	const bin = atob(b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
	const reg = await navigator.serviceWorker.getRegistration("/");
	return (await reg?.pushManager.getSubscription()) ?? null;
}

export type PushStatus = "unsupported" | "unavailable" | "blocked" | "off" | "on";

/** State and switches for the Settings toggle. */
export function usePushNotifications(mailboxId: string | undefined) {
	const [status, setStatus] = useState<PushStatus | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		if (!supported()) return setStatus("unsupported");
		const { publicKey } = await api.getPushConfig().catch(() => ({ publicKey: null }));
		if (!publicKey) return setStatus("unavailable");
		if (Notification.permission === "denied") return setStatus("blocked");
		setStatus((await currentSubscription()) && Notification.permission === "granted" ? "on" : "off");
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const enable = useCallback(async () => {
		if (!mailboxId) return;
		setBusy(true);
		try {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setStatus(permission === "denied" ? "blocked" : "off");
				return;
			}
			const { publicKey } = await api.getPushConfig();
			if (!publicKey) return setStatus("unavailable");
			const reg = await navigator.serviceWorker.ready;
			let sub = await reg.pushManager.getSubscription();
			// A subscription made with another server key can't receive our pushes.
			const current = sub?.options.applicationServerKey;
			if (sub && current && !sameKey(new Uint8Array(current), keyBytes(publicKey))) {
				await sub.unsubscribe();
				sub = null;
			}
			sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
			await api.savePushSubscription(mailboxId, sub.toJSON());
			setStatus("on");
		} finally {
			setBusy(false);
		}
	}, [mailboxId]);

	const disable = useCallback(async () => {
		if (!mailboxId) return;
		setBusy(true);
		try {
			const sub = await currentSubscription();
			if (sub) {
				await api.deletePushSubscription(mailboxId, sub.endpoint).catch(() => {});
				await sub.unsubscribe();
			}
			setStatus("off");
		} finally {
			setBusy(false);
		}
	}, [mailboxId]);

	return { status, busy, enable, disable };
}

function sameKey(a: Uint8Array, b: Uint8Array) {
	return a.length === b.length && a.every((x, i) => x === b[i]);
}

const synced = new Set<string>();

/**
 * Re-sends this browser's subscription once per session, so the server's copy
 * survives the browser rotating it and a mailbox reset.
 */
export function usePushSync(mailboxId: string | undefined) {
	useEffect(() => {
		if (!mailboxId || synced.has(mailboxId) || !supported() || Notification.permission !== "granted") return;
		synced.add(mailboxId);
		currentSubscription()
			.then((sub) => sub && api.savePushSubscription(mailboxId, sub.toJSON()))
			.catch(() => synced.delete(mailboxId));
	}, [mailboxId]);
}
