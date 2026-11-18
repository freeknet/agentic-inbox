import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import type { Env } from "../workers/types";
import worker from "./worker-entry";

// POLICY_AUD / TEAM_DOMAIN are production secrets, absent from generated types.
const testEnv = env as Env;

export const MAILBOX = "me@example.com";

/** Call the API app the way a same-origin browser request would. */
export async function api(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request(`https://inbox.test${path}`, init), testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

export async function createMailbox(email = MAILBOX): Promise<void> {
	const res = await api("/api/v1/mailboxes", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, name: "Test" }),
	});
	if (res.status !== 201) throw new Error(`createMailbox failed: ${res.status} ${await res.text()}`);
}

export function mailboxStub(email = MAILBOX) {
	return env.MAILBOX.get(env.MAILBOX.idFromName(email));
}

/** Deliver a raw RFC 5322 message through the email() handler. */
export async function deliver(raw: string): Promise<void> {
	const bytes = new TextEncoder().encode(raw);
	const ctx = createExecutionContext();
	await worker.email({ raw: new Response(bytes).body!, rawSize: bytes.byteLength }, testEnv, ctx);
	// Flushes the auto-draft trigger; it fails without Workers AI and is caught/logged.
	await waitOnExecutionContext(ctx);
}

export interface MimeOptions {
	from?: string;
	to?: string;
	cc?: string;
	subject?: string;
	messageId?: string;
	inReplyTo?: string;
	references?: string;
	date?: string;
	text?: string;
	attachment?: { filename: string; contentType: string; content: string };
}

/** Build a small MIME message. CRLF line endings, as on the wire. */
export function mime(o: MimeOptions = {}): string {
	const headers = [
		`From: ${o.from ?? "Alice <alice@sender.test>"}`,
		`To: ${o.to ?? MAILBOX}`,
		...(o.cc ? [`Cc: ${o.cc}`] : []),
		`Subject: ${o.subject ?? "Hello"}`,
		`Message-ID: <${o.messageId ?? `${crypto.randomUUID()}@sender.test`}>`,
		...(o.inReplyTo ? [`In-Reply-To: <${o.inReplyTo}>`] : []),
		...(o.references ? [`References: ${o.references}`] : []),
		`Date: ${o.date ?? "Tue, 03 Nov 2026 10:00:00 +0000"}`,
		"MIME-Version: 1.0",
	];
	const text = o.text ?? "Hi there.";
	if (!o.attachment) {
		return [...headers, "Content-Type: text/plain; charset=utf-8", "", text, ""].join("\r\n");
	}
	const b = "BOUNDARY42";
	return [
		...headers,
		`Content-Type: multipart/mixed; boundary="${b}"`,
		"",
		`--${b}`,
		"Content-Type: text/plain; charset=utf-8",
		"",
		text,
		`--${b}`,
		`Content-Type: ${o.attachment.contentType}; name="${o.attachment.filename}"`,
		`Content-Disposition: attachment; filename="${o.attachment.filename}"`,
		"Content-Transfer-Encoding: base64",
		"",
		btoa(o.attachment.content),
		`--${b}--`,
		"",
	].join("\r\n");
}
