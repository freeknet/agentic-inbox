/**
 * Svix webhook signature verification (used by Resend).
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 *
 * signed content = `${svix-id}.${svix-timestamp}.${rawBody}`
 * key            = base64-decode(secret without the `whsec_` prefix)
 * header         = space-separated `v1,<base64 HMAC-SHA256>` entries
 */

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Compares every byte regardless of where the first difference is. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

export interface SvixHeaders {
	id: string | null | undefined;
	timestamp: string | null | undefined;
	signature: string | null | undefined;
}

export async function verifySvixSignature(
	secret: string,
	headers: SvixHeaders,
	rawBody: string,
	nowMs: number = Date.now(),
): Promise<boolean> {
	const { id, timestamp, signature } = headers;
	if (!id || !timestamp || !signature) return false;

	const ts = Number(timestamp);
	if (!Number.isInteger(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return false;

	let keyBytes: Uint8Array<ArrayBuffer>;
	try {
		keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
	} catch {
		return false;
	}
	const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const expected = new Uint8Array(
		await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)),
	);

	for (const entry of signature.split(" ")) {
		const [version, sig] = entry.split(",", 2);
		if (version !== "v1" || !sig) continue;
		let candidate: Uint8Array;
		try {
			candidate = base64ToBytes(sig);
		} catch {
			continue;
		}
		if (constantTimeEqual(candidate, expected)) {
			return true;
		}
	}
	return false;
}
