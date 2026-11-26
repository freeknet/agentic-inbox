import { jwtVerify, importJWK } from "jose";
import { describe, expect, it } from "vitest";
import { senderLabel } from "../workers/routes/push";
import { b64url, ecdhParams, encryptPayload, fromB64url, isPushEndpoint, loadVapidKeys, vapidAuthorization } from "../workers/lib/webpush";

const subtle = crypto.subtle;

/** Decrypts an aes128gcm push message the way a browser does (RFC 8291). */
async function browserDecrypt(body: Uint8Array, ua: CryptoKeyPair, uaPublic: Uint8Array, auth: Uint8Array) {
	const salt = body.slice(0, 16);
	const idlen = body[20];
	const asPublic = body.slice(21, 21 + idlen);
	const cipher = body.slice(21 + idlen);
	const as = await subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
	const ecdh = new Uint8Array(await subtle.deriveBits(ecdhParams(as), ua.privateKey, 256));
	const te = new TextEncoder();
	const hk = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
		new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info }, await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8));
	const info = new Uint8Array([...te.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
	const ikm = await hk(auth, ecdh, info, 32);
	const cek = await hk(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hk(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
	const key = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
	const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
	expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
	return new TextDecoder().decode(plain.slice(0, -1));
}

async function vapidSecret() {
	const pair = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
	return JSON.stringify(await subtle.exportKey("jwk", pair.privateKey));
}

describe("web push", () => {
	it("encrypts a message the subscribing browser can read", async () => {
		const ua = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
		const uaPublic = new Uint8Array((await subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer);
		const auth = crypto.getRandomValues(new Uint8Array(16));
		const body = await encryptPayload({ p256dh: b64url(uaPublic), auth: b64url(auth) }, new TextEncoder().encode('{"title":"Hi"}'));
		expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
		expect(await browserDecrypt(body, ua, uaPublic, auth)).toBe('{"title":"Hi"}');
	});

	it("signs a VAPID token for the push service's origin with the derived public key", async () => {
		const keys = await loadVapidKeys(await vapidSecret());
		expect(fromB64url(keys.publicKey)).toHaveLength(65);
		const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "mailto:me@example.com");
		const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
		expect(k).toBe(keys.publicKey);
		const raw = fromB64url(k);
		const pub = await importJWK({ kty: "EC", crv: "P-256", x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33)) }, "ES256");
		const { payload } = await jwtVerify(token, pub, { audience: "https://fcm.googleapis.com" });
		expect(payload.sub).toBe("mailto:me@example.com");
	});

	it("rejects a secret that isn't a P-256 private key, and endpoints that aren't push services", async () => {
		await expect(loadVapidKeys('{"kty":"oct","k":"x"}')).rejects.toThrow();
		expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
		expect(isPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=x")).toBe(true);
		expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
		expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
		expect(isPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
	});

	it("shows the sender's name in the notification", () => {
		expect(senderLabel('"Ann Lee" <ann@x.com>')).toBe("Ann Lee");
		expect(senderLabel("<ann@x.com>")).toBe("ann@x.com");
		expect(senderLabel("ann@x.com")).toBe("ann@x.com");
	});
});
