// Free-tier probe for plan v2 Phase 1. Throwaway: answers four questions the
// docs leave open, then gets deleted. See probe/README.md for the run sheet.
//
//  1. CPU budget of a Durable Object request on Workers Free (30 s or 10 ms?)
//  2. Whether each RPC call into a DO gets a fresh CPU budget
//  3. Resend: is a presigned R2 URL accepted as an attachment `path`, and is a
//     custom Message-ID preserved?
//  4. Cloudflare Access: does a path-scoped Bypass app let /webhooks/resend through?
//
// Wall-clock timers do not advance during pure CPU work in Workers, so CPU is
// read from `wrangler tail` (outcome / cpuTime), not measured here.

import { DurableObject } from "cloudflare:workers";
import PostalMime from "postal-mime";
import { AwsClient } from "aws4fetch";

interface Env {
	BUCKET: R2Bucket;
	PROBE: DurableObjectNamespace<ProbeDO>;
	R2_BUCKET_NAME: string;
	MAIL_DOMAIN: string;
	// Secrets (wrangler secret put -c probe/wrangler.jsonc NAME)
	RESEND_API_KEY?: string;
	R2_ACCESS_KEY_ID?: string;
	R2_SECRET_ACCESS_KEY?: string;
	CF_ACCOUNT_ID?: string;
}

async function parseFromR2(bucket: R2Bucket, key: string) {
	const obj = await bucket.get(key);
	if (!obj) throw new Error(`R2 object not found: ${key} (upload the fixture first)`);
	const raw = await obj.arrayBuffer();
	const email = await new PostalMime().parse(raw);
	return {
		key,
		bytes: raw.byteLength,
		attachments: email.attachments.length,
		attachmentBytes: email.attachments.reduce(
			(n, a) => n + (typeof a.content === "string" ? a.content.length : a.content.byteLength),
			0,
		),
		htmlChars: email.html?.length ?? 0,
		textChars: email.text?.length ?? 0,
	};
}

function toBase64(bytes: Uint8Array): string {
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	return btoa(bin);
}

export class ProbeDO extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY, at TEXT, body TEXT)");
	}

	/** Full MIME parse inside the DO (question 1). */
	async parse(key: string) {
		return parseFromR2(this.env.BUCKET, key);
	}

	/** Base64-encode an object: the cost of Resend `content` if `path` fails. */
	async base64(key: string) {
		const obj = await this.env.BUCKET.get(key);
		if (!obj) throw new Error(`R2 object not found: ${key}`);
		const b64 = toBase64(new Uint8Array(await obj.arrayBuffer()));
		return { key, base64Chars: b64.length };
	}

	/** Same parse, but in an alarm (alarms have their own budget). */
	async scheduleParse(key: string) {
		await this.ctx.storage.put("alarmKey", key);
		await this.ctx.storage.setAlarm(Date.now() + 1000);
		return { scheduled: key };
	}

	async alarm() {
		const key = (await this.ctx.storage.get<string>("alarmKey")) ?? "";
		let body: unknown;
		try {
			body = { ok: true, ...(await parseFromR2(this.env.BUCKET, key)) };
		} catch (e) {
			body = { ok: false, error: (e as Error).message };
		}
		this.ctx.storage.sql.exec("INSERT INTO results (at, body) VALUES (?, ?)", new Date().toISOString(), JSON.stringify(body));
	}

	async results() {
		return [...this.ctx.storage.sql.exec("SELECT at, body FROM results ORDER BY id DESC LIMIT 10")];
	}
}

async function presignGet(env: Env, key: string, expiresSeconds: number): Promise<string> {
	if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
		throw new Error("Set secrets R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and CF_ACCOUNT_ID");
	}
	const client = new AwsClient({
		accessKeyId: env.R2_ACCESS_KEY_ID,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		service: "s3",
		region: "auto",
	});
	const url = new URL(`https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`);
	url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
	const signed = await client.sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
	return signed.url;
}

// 1x1 PNG, used as an inline image to test content_id with `path`.
const PIXEL_PNG = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
	(c) => c.charCodeAt(0),
);

async function resend(env: Env, path: string, init: RequestInit = {}) {
	if (!env.RESEND_API_KEY) throw new Error("Set secret RESEND_API_KEY");
	const res = await fetch(`https://api.resend.com${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
			"User-Agent": "agentic-inbox-probe/1.0",
			...(init.headers as Record<string, string> | undefined),
		},
	});
	return { status: res.status, body: await res.json().catch(() => null) };
}

async function sendProbeEmail(env: Env, to: string, scheduledAt?: string) {
	await env.BUCKET.put("probe/attachment.txt", `Probe attachment generated ${new Date().toISOString()}\n`);
	await env.BUCKET.put("probe/pixel.png", PIXEL_PNG);
	const expires = scheduledAt ? 6 * 3600 : 3600;
	const customMessageId = `<probe-${crypto.randomUUID()}@${env.MAIL_DOMAIN}>`;
	const result = await resend(env, "/emails", {
		method: "POST",
		headers: { "Idempotency-Key": crypto.randomUUID() },
		body: JSON.stringify({
			from: `Probe <probe@${env.MAIL_DOMAIN}>`,
			to: [to],
			subject: `agentic-inbox probe ${scheduledAt ? "(scheduled) " : ""}${new Date().toISOString()}`,
			html: `<p>Probe. Inline pixel: <img src="cid:probe-pixel" width="1" height="1"></p><p>Custom Message-ID sent: ${customMessageId.replace(/[<>]/g, "")}</p>`,
			text: `Probe. Custom Message-ID sent: ${customMessageId}`,
			headers: { "Message-ID": customMessageId },
			attachments: [
				{ filename: "probe.txt", path: await presignGet(env, "probe/attachment.txt", expires), content_type: "text/plain" },
				{ filename: "pixel.png", path: await presignGet(env, "probe/pixel.png", expires), content_type: "image/png", content_id: "probe-pixel" },
			],
			...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
		}),
	});
	return { customMessageId, ...result };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const key = url.searchParams.get("key") ?? "fixtures/20mb.eml";
		const stub = env.PROBE.get(env.PROBE.idFromName("probe"));
		try {
			switch (url.pathname) {
				// 4. Access: both paths echo whether Access injected a JWT.
				case "/webhooks/resend":
				case "/private":
					return json({ path: url.pathname, accessJwtPresent: request.headers.has("cf-access-jwt-assertion") });

				// 1. Parse in the Worker itself (expected to exceed 10 ms on large input).
				case "/cpu/worker-parse":
					return json(await parseFromR2(env.BUCKET, key));
				// 1. Parse inside the DO via one RPC call.
				case "/cpu/do-parse":
					return json(await stub.parse(key));
				// 1. Parse inside a DO alarm; read with /cpu/alarm-results after a few seconds.
				case "/cpu/do-alarm":
					return json(await stub.scheduleParse(key));
				case "/cpu/alarm-results":
					return json(await stub.results());
				// 2. n sequential RPC parses in one Worker request: succeeds only if each RPC gets its own budget.
				case "/cpu/rpc-chain": {
					const n = Number(url.searchParams.get("n") ?? "5");
					const out = [];
					for (let i = 0; i < n; i++) out.push(await stub.parse(key));
					return json({ calls: n, results: out });
				}
				// Cost of the base64 fallback for Resend `content`.
				case "/cpu/do-base64":
					return json(await stub.base64(key));

				// 3. Resend presigned `path` attachment + custom Message-ID.
				case "/resend/send": {
					const to = url.searchParams.get("to");
					if (!to) return json({ error: "?to=address required" }, 400);
					return json(await sendProbeEmail(env, to));
				}
				case "/resend/send-scheduled": {
					const to = url.searchParams.get("to");
					if (!to) return json({ error: "?to=address required" }, 400);
					return json(await sendProbeEmail(env, to, "in 3 min"));
				}
				// Needs a full-access key: returns Resend's recorded message_id.
				case "/resend/status": {
					const id = url.searchParams.get("id");
					if (!id) return json({ error: "?id=resend email id required" }, 400);
					return json(await resend(env, `/emails/${encodeURIComponent(id)}`));
				}
				default:
					return json({
						endpoints: [
							"/cpu/worker-parse?key=", "/cpu/do-parse?key=", "/cpu/do-alarm?key=", "/cpu/alarm-results",
							"/cpu/rpc-chain?key=&n=", "/cpu/do-base64?key=", "/resend/send?to=", "/resend/send-scheduled?to=",
							"/resend/status?id=", "/webhooks/resend", "/private",
						],
					});
			}
		} catch (e) {
			return json({ error: (e as Error).message }, 500);
		}
	},
} satisfies ExportedHandler<Env>;
