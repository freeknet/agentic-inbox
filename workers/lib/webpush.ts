/**
 * Web Push from a Worker with WebCrypto only: message encryption (RFC 8291,
 * aes128gcm per RFC 8188) and VAPID sender identification (RFC 8292).
 *
 * The VAPID key pair is one secret, VAPID_PRIVATE_KEY: a P-256 private key as
 * a JWK JSON string ({"kty":"EC","crv":"P-256","x","y","d"}). The public key
 * the browser subscribes with is derived from it, so nothing else needs to
 * stay in step.
 */

export interface PushSubscriptionKeys {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface VapidKeys {
	privateKey: CryptoKey;
	/** Uncompressed P-256 point, base64url (the browser's applicationServerKey). */
	publicKey: string;
}

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = "";
	for (const x of b) s += String.fromCharCode(x);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
	const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

const vapidCache = new Map<string, Promise<VapidKeys>>();

/** Imports the VAPID secret (cached per isolate). Throws if it isn't a P-256 private JWK. */
export function loadVapidKeys(secret: string): Promise<VapidKeys> {
	let keys = vapidCache.get(secret);
	if (!keys) {
		keys = (async () => {
			const jwk = JSON.parse(secret) as JsonWebKey;
			if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y) throw new Error("VAPID_PRIVATE_KEY must be a P-256 private JWK");
			const privateKey = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"], ext: false }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
			const publicKey = b64url(concat(new Uint8Array([4]), fromB64url(jwk.x), fromB64url(jwk.y)));
			return { privateKey, publicKey };
		})();
		vapidCache.set(secret, keys);
		keys.catch(() => vapidCache.delete(secret));
	}
	return keys;
}

/** The VAPID Authorization header value for one push service origin. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
	const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
	const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
	const unsigned = `${header}.${claims}`;
	// WebCrypto ECDSA signatures are already r||s, which is what JWS ES256 wants.
	const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, enc.encode(unsigned));
	return `vapid t=${unsigned}.${b64url(sig)}, k=${keys.publicKey}`;
}

/** ECDH parameters; workers-types spells the standard `public` member `$public`. */
export function ecdhParams(publicKey: CryptoKey): SubtleCryptoDeriveKeyAlgorithm {
	return { name: "ECDH", public: publicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
}

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Encrypts one push message for a subscription (single aes128gcm record). */
export async function encryptPayload(sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">, plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
	const uaPublic = fromB64url(sub.p256dh);
	const authSecret = fromB64url(sub.auth);
	if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("Invalid push subscription keys");

	const ua = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
	const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
	const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
	const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams(ua), local.privateKey, 256));

	const ikm = await hkdf(authSecret, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

	const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
	// 0x02 marks the last (only) record; no padding.
	const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

	const header = new Uint8Array(16 + 4 + 1 + 65);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = 65;
	header.set(asPublic, 21);
	return concat(header, cipher);
}

export type PushResult = "sent" | "gone" | "failed";

/**
 * Sends one notification. "gone" means the subscription has expired or been
 * revoked (404/410) and should be deleted.
 */
export async function sendPush(sub: PushSubscriptionKeys, payload: unknown, keys: VapidKeys, subject: string, opts: { ttl?: number; urgency?: "high" | "normal" } = {}): Promise<PushResult> {
	const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
	const res = await fetch(sub.endpoint, {
		method: "POST",
		headers: {
			Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			TTL: String(opts.ttl ?? 86400),
			Urgency: opts.urgency ?? "high",
		},
		body,
	});
	if (res.status === 404 || res.status === 410) return "gone";
	if (!res.ok) {
		console.error(`Push to ${new URL(sub.endpoint).host} failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
		return "failed";
	}
	return "sent";
}

/** Push services browsers use; subscriptions to anywhere else are refused. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
	} catch {
		return false;
	}
}
