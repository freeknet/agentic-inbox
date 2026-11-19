import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAILBOX, api, createMailbox, mailboxStub } from "./helpers";

const base = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}`;
const post = (body: unknown): RequestInit => ({
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
});
// Must match vitest.config.ts.
const WEBHOOK_SECRET = "whsec_dGVzdC13ZWJob29rLXNlY3JldC0wMTIzNDU2Nzg5";

interface SentCall {
	url: string;
	headers: Headers;
	body: Record<string, any>;
}

/** Replace global fetch for api.resend.com with a scripted sequence of responses. */
function mockResend(...responses: Array<() => Response>) {
	const calls: SentCall[] = [];
	let i = 0;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const req = new Request(input as RequestInfo, init);
		if (!req.url.startsWith("https://api.resend.com/")) throw new Error(`Unexpected fetch: ${req.url}`);
		calls.push({ url: req.url, headers: req.headers, body: await req.json() });
		const make = responses[Math.min(i++, responses.length - 1)];
		return make();
	});
	return calls;
}

const okResponse = (id = "re_123", quota?: number) => () =>
	Response.json({ id }, { status: 200, headers: quota === undefined ? {} : { "x-resend-daily-quota": String(quota) } });
const errResponse = (status: number, name: string, headers: Record<string, string> = {}) => () =>
	Response.json({ statusCode: status, name, message: name }, { status, headers });

async function send(body: Record<string, unknown> = {}) {
	return api(`${base}/emails`, post({ to: "bob@other.test", from: MAILBOX, subject: "Hi", text: "hello", ...body }));
}

/**
 * Make every queued row due now (skips the 10 s undo window) and run the
 * alarm handler. Calls alarm() directly: an alarm set to "now" would also fire
 * on its own in the background and race the assertions.
 */
async function flush(opts: { keepPause?: boolean } = {}) {
	const stub = mailboxStub();
	await runInDurableObject(stub, async (instance, state) => {
		state.storage.sql.exec(`UPDATE outbox SET send_at = 0, next_attempt_at = 0 WHERE status = 'queued'`);
		if (!opts.keepPause) state.storage.sql.exec(`DELETE FROM outbox_meta WHERE key = 'paused_until'`);
		await instance.alarm();
	});
}

function outboxRow(id: string) {
	return runInDurableObject(mailboxStub(), (_i, state) =>
		[...state.storage.sql.exec(`SELECT * FROM outbox WHERE id = ?`, id)][0] as Record<string, any> | undefined,
	);
}

async function emailRow(id: string) {
	return (await (await api(`${base}/emails/${id}`)).json()) as Record<string, any>;
}

async function sign(id: string, timestamp: number, body: string, secret = WEBHOOK_SECRET) {
	const keyBytes = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
	return `v1,${btoa(String.fromCharCode(...sig))}`;
}

async function webhook(event: unknown, opts: { id?: string; timestamp?: number; secret?: string; signature?: string } = {}) {
	const body = JSON.stringify(event);
	const id = opts.id ?? `msg_${crypto.randomUUID()}`;
	const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
	const signature = opts.signature ?? (await sign(id, timestamp, body, opts.secret));
	return api("/webhooks/resend", {
		method: "POST",
		headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": signature },
		body,
	});
}

describe("outbox", () => {
	beforeEach(async () => {
		await createMailbox();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("queues with a 10 s undo window and sends from the alarm with Resend headers", async () => {
		const calls = mockResend(okResponse("re_abc", 1));
		const res = await send({ cc: "carol@other.test", from: { email: MAILBOX, name: "Me" } });
		expect(res.status).toBe(202);
		const { id, status, send_at } = (await res.json()) as { id: string; status: string; send_at: number };
		expect(status).toBe("queued");
		expect(send_at - Date.now()).toBeGreaterThan(8_000);
		expect((await emailRow(id)).delivery_status).toBe("queued");

		// Alarm before send_at sends nothing.
		await runDurableObjectAlarm(mailboxStub());
		expect(calls).toHaveLength(0);

		await flush();
		expect(calls).toHaveLength(1);
		const [call] = calls;
		expect(call.url).toBe("https://api.resend.com/emails");
		expect(call.headers.get("authorization")).toBe("Bearer re_test_key");
		expect(call.headers.get("idempotency-key")).toBe(id);
		expect(call.headers.get("user-agent")).toMatch(/agentic-inbox/);
		expect(call.body).toMatchObject({
			from: `"Me" <${MAILBOX}>`,
			to: ["bob@other.test"],
			cc: ["carol@other.test"],
			subject: "Hi",
			text: "hello",
			tags: [{ name: "outbox_id", value: id }],
		});

		expect(await outboxRow(id)).toMatchObject({ status: "sent", provider_id: "re_abc", attempts: 1 });
		expect((await emailRow(id)).delivery_status).toBe("sent");
	});

	it("exposes delivery_status in the threaded Sent list", async () => {
		mockResend(okResponse());
		await send();
		await flush();
		const res = await api(`${base}/emails?folder=sent&threaded=true`);
		const { emails } = (await res.json()) as { emails: Array<{ delivery_status: string }> };
		expect(emails[0].delivery_status).toBe("sent");
	});

	it("sends attachments as base64 content", async () => {
		const calls = mockResend(okResponse());
		const content = btoa("attached bytes");
		const r = await send({ attachments: [{ content, filename: "a.txt", type: "text/plain", disposition: "attachment" }] });
		const { id } = (await r.json()) as { id: string };
		await flush();
		expect(await outboxRow(id)).toMatchObject({ status: "sent" });
		expect(calls[0].body.attachments).toEqual([{ filename: "a.txt", content, content_type: "text/plain" }]);
	});

	it("rejects an upload without Content-Length (411) or over the size limit (413)", async () => {
		const stream = new ReadableStream({
			start(c) {
				c.enqueue(new TextEncoder().encode("chunked"));
				c.close();
			},
		});
		const chunked = await api(`${base}/uploads?filename=a.txt`, { method: "PUT", body: stream, duplex: "half" } as RequestInit);
		expect(chunked.status).toBe(411);
		const big = await api(`${base}/uploads?filename=a.bin`, {
			method: "PUT",
			headers: { "Content-Length": String(19 * 1024 * 1024) },
			body: "x",
		});
		expect(big.status).toBe(413);
	});

	it("sends an uploaded file, moving it out of uploads/", async () => {
		const calls = mockResend(okResponse());
		const up = await api(`${base}/uploads?filename=${encodeURIComponent("re port.pdf")}`, {
			method: "PUT",
			headers: { "Content-Type": "application/pdf", "Content-Length": "13" },
			body: "%PDF-1.7 fake",
		});
		expect(up.status).toBe(201);
		const upload = (await up.json()) as { upload_id: string; filename: string; size: number; type: string };
		expect(upload).toMatchObject({ filename: "re port.pdf", size: 13, type: "application/pdf" });

		const r = await send({ attachments: [{ upload_id: upload.upload_id }] });
		expect(r.status).toBe(202);
		const { id } = (await r.json()) as { id: string };
		const { env } = await import("cloudflare:workers");
		expect((await env.BUCKET.list({ prefix: "uploads/" })).objects).toHaveLength(0);
		const full = (await mailboxStub().getEmail(id)) as Record<string, any>;
		expect(full.attachments).toMatchObject([{ filename: "re port.pdf", mimetype: "application/pdf", size: 13 }]);

		await flush();
		expect(calls[0].body.attachments).toEqual([
			{ filename: "re port.pdf", content: btoa("%PDF-1.7 fake"), content_type: "application/pdf" },
		]);
	});

	it("rejects a send that references a missing upload", async () => {
		const r = await send({ attachments: [{ upload_id: crypto.randomUUID() }] });
		expect(r.status).toBe(400);
	});

	it("forwards the original's attachments", async () => {
		const calls = mockResend(okResponse("re_1"), okResponse("re_2"));
		const content = btoa("original file");
		const first = await send({ attachments: [{ content, filename: "orig.txt", type: "text/plain", disposition: "attachment" }] });
		const { id: originalId } = (await first.json()) as { id: string };
		const fwd = await api(`${base}/emails/${originalId}/forward`, post({ to: "dan@other.test", from: MAILBOX, subject: "Fwd: Hi", text: "fyi" }));
		expect(fwd.status).toBe(202);
		const { id: fwdId } = (await fwd.json()) as { id: string };
		const full = (await mailboxStub().getEmail(fwdId)) as Record<string, any>;
		expect(full.attachments).toMatchObject([{ filename: "orig.txt", size: 13 }]);
		await flush();
		const fwdCall = calls.find((c) => c.body.to[0] === "dan@other.test")!;
		expect(fwdCall.body.attachments).toEqual([{ filename: "orig.txt", content, content_type: "text/plain" }]);

		// An explicit empty selection forwards no files.
		const none = await api(`${base}/emails/${originalId}/forward`, post({ to: "dan@other.test", from: MAILBOX, subject: "Fwd", text: "x", forward_attachment_ids: [] }));
		const { id: noneId } = (await none.json()) as { id: string };
		expect(((await mailboxStub().getEmail(noneId)) as Record<string, any>).attachments).toHaveLength(0);
	});

	it("send later: waits until send_at, can be cancelled until then, rejects > 1 year", async () => {
		const calls = mockResend(okResponse());
		const at = new Date(Date.now() + 3 * 60 * 60 * 1000);
		const r = await send({ send_at: at.toISOString() });
		expect(r.status).toBe(202);
		const { id, send_at } = (await r.json()) as { id: string; send_at: number };
		expect(Math.abs(send_at - at.getTime())).toBeLessThan(2_000);
		await runInDurableObject(mailboxStub(), async (instance) => {
			await instance.alarm();
		});
		expect(calls).toHaveLength(0);
		// Still cancellable an hour before.
		const cancel = await api(`${base}/emails/${id}/cancel-send`, { method: "POST" });
		expect(cancel.status).toBe(200);

		const far = await send({ send_at: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString() });
		expect(far.status).toBe(400);
	});

	it("undo before send_at returns the message to Drafts and nothing is sent", async () => {
		const calls = mockResend(okResponse());
		const { id } = (await (await send()).json()) as { id: string };
		const undo = await api(`${base}/emails/${id}/cancel-send`, { method: "POST" });
		expect(undo.status).toBe(200);
		expect(await outboxRow(id)).toBeUndefined();
		const email = await emailRow(id);
		expect(email.folder_id).toBe("draft");
		await runDurableObjectAlarm(mailboxStub());
		expect(calls).toHaveLength(0);
	});

	it("undo after sending is refused", async () => {
		mockResend(okResponse());
		const { id } = (await (await send()).json()) as { id: string };
		await flush();
		const undo = await api(`${base}/emails/${id}/cancel-send`, { method: "POST" });
		expect(undo.status).toBe(409);
	});

	it("retries 500s with exponential backoff, then succeeds", async () => {
		const calls = mockResend(errResponse(500, "application_error"), okResponse("re_ok"));
		const { id } = (await (await send()).json()) as { id: string };
		const before = Date.now();
		await flush();
		let row = await outboxRow(id);
		expect(row).toMatchObject({ status: "queued", attempts: 1 });
		expect(row!.last_error).toMatch(/500 application_error/);
		expect(row!.next_attempt_at - before).toBeGreaterThanOrEqual(30_000);
		expect(row!.next_attempt_at - before).toBeLessThan(40_000);

		await flush();
		row = await outboxRow(id);
		expect(row).toMatchObject({ status: "sent", provider_id: "re_ok", attempts: 2 });
		// Same idempotency key on the retry.
		expect(calls.map((c) => c.headers.get("idempotency-key"))).toEqual([id, id]);
	});

	it("honours retry-after on 429 rate_limit_exceeded", async () => {
		mockResend(errResponse(429, "rate_limit_exceeded", { "retry-after": "7" }));
		const { id } = (await (await send()).json()) as { id: string };
		const before = Date.now();
		await flush();
		const row = await outboxRow(id);
		expect(row!.status).toBe("queued");
		expect(row!.next_attempt_at - before).toBeGreaterThanOrEqual(7_000);
		expect(row!.next_attempt_at - before).toBeLessThan(9_000);
	});

	it("gives up after the maximum number of attempts", async () => {
		mockResend(errResponse(503, "service_unavailable"));
		const { id } = (await (await send()).json()) as { id: string };
		for (let i = 0; i < 8; i++) await flush();
		expect(await outboxRow(id)).toMatchObject({ status: "failed", attempts: 8 });
		expect((await emailRow(id)).delivery_status).toBe("failed");
	});

	it("marks other 4xx errors failed without retrying", async () => {
		const calls = mockResend(errResponse(422, "validation_error"));
		const { id } = (await (await send()).json()) as { id: string };
		await flush();
		await flush();
		expect(calls).toHaveLength(1);
		expect(await outboxRow(id)).toMatchObject({ status: "failed", attempts: 1 });
	});

	it("pauses the whole outbox until 00:00 UTC on daily_quota_exceeded", async () => {
		const calls = mockResend(errResponse(429, "daily_quota_exceeded"));
		const first = (await (await send({ subject: "one" })).json()) as { id: string };
		await send({ subject: "two" });
		const stub = mailboxStub();
		await flush();

		expect(calls).toHaveLength(1);
		const now = new Date();
		const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
		const row = await outboxRow(first.id);
		expect(row).toMatchObject({ status: "queued", next_attempt_at: midnight });
		const quota = (await (await api(`${base}/send-quota`)).json()) as { pausedUntil: number };
		expect(quota.pausedUntil).toBe(midnight);
		expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(midnight);

		// Running the alarm again while paused sends nothing.
		await runInDurableObject(stub, (instance) => instance.alarm());
		expect(calls).toHaveLength(1);
		// Once the pause has passed, the queue drains.
		await runInDurableObject(stub, (_i, state) => {
			state.storage.sql.exec(`UPDATE outbox_meta SET value = '0' WHERE key = 'paused_until'`);
		});
		vi.restoreAllMocks();
		const after = mockResend(okResponse());
		await flush({ keepPause: true });
		expect(after).toHaveLength(2);
	});

	it("enforces 100 recipients per UTC day and 50 per message", async () => {
		mockResend(okResponse());
		const many = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}@other.test`);
		expect((await send({ to: many(51, "a") })).status).toBe(400);
		expect((await send({ to: many(30, "b"), cc: many(20, "c") })).status).toBe(202);
		expect((await send({ to: many(40, "d"), bcc: many(10, "e") })).status).toBe(202);
		const over = await send({ to: "one-more@other.test" });
		expect(over.status).toBe(429);
		expect(((await over.json()) as { error: string }).error).toMatch(/100 of 100/);
	});

	it("counts recipients sent on an earlier UTC day against that day only", async () => {
		mockResend(okResponse());
		const { id } = (await (await send({ to: Array.from({ length: 50 }, (_, i) => `x${i}@other.test`) })).json()) as { id: string };
		await flush();
		await runInDurableObject(mailboxStub(), (_i, state) => {
			state.storage.sql.exec(`UPDATE outbox SET quota_day = '2000-01-01' WHERE id = ?`, id);
		});
		const quota = (await (await api(`${base}/send-quota`)).json()) as { used: number };
		expect(quota.used).toBe(0);
	});

	it("uses Resend's x-resend-daily-quota when it is higher than the local count", async () => {
		mockResend(okResponse("re_q", 99));
		await send();
		await flush();
		const quota = (await (await api(`${base}/send-quota`)).json()) as { used: number };
		expect(quota.used).toBe(99);
		expect((await send({ to: ["p@other.test", "q@other.test"] })).status).toBe(429);
	});

	it("consumes the draft in the same transaction as queueing (B9)", async () => {
		mockResend(okResponse());
		const draft = (await (await api(`${base}/drafts`, post({ to: "bob@other.test", subject: "d", body: "draft" }))).json()) as { id: string };
		const res = await send({ draft_id: draft.id });
		expect(res.status).toBe(202);
		const drafts = (await (await api(`${base}/emails?folder=draft`)).json()) as { emails: unknown[] };
		expect(drafts.emails).toHaveLength(0);
		const sent = (await (await api(`${base}/emails?folder=sent`)).json()) as { emails: unknown[] };
		expect(sent.emails).toHaveLength(1);
	});

	it("does not consume the draft when the send is rejected", async () => {
		const draft = (await (await api(`${base}/drafts`, post({ to: "bob@other.test", subject: "d", body: "draft" }))).json()) as { id: string };
		const res = await send({ draft_id: draft.id, to: Array.from({ length: 51 }, (_, i) => `z${i}@other.test`) });
		expect(res.status).toBe(400);
		const drafts = (await (await api(`${base}/emails?folder=draft`)).json()) as { emails: unknown[] };
		expect(drafts.emails).toHaveLength(1);
	});

	it("queues replies with threading headers", async () => {
		const calls = mockResend(okResponse());
		const stub = mailboxStub();
		await stub.createEmail("inbox", {
			id: "orig", subject: "Question", sender: "bob@other.test", recipient: MAILBOX,
			date: new Date().toISOString(), body: "?", thread_id: "orig", message_id: "orig-mid@other.test",
		}, []);
		const res = await api(`${base}/emails/orig/reply`, post({ to: "bob@other.test", from: MAILBOX, subject: "Re: Question", text: "answer" }));
		expect(res.status).toBe(202);
		await flush();
		expect(calls[0].body.headers).toEqual({ "In-Reply-To": "<orig-mid@other.test>", References: "<orig-mid@other.test>" });
	});
});

describe("Resend webhook", () => {
	beforeEach(async () => {
		await createMailbox();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function sentMessage() {
		mockResend(okResponse("re_evt"));
		const { id } = (await (await send()).json()) as { id: string };
		await flush();
		return id;
	}

	const emailEvent = (type: string, outboxId: string, extra: Record<string, unknown> = {}) => ({
		type,
		created_at: new Date().toISOString(),
		data: { email_id: "re_evt", from: `Me <${MAILBOX}>`, to: ["bob@other.test"], subject: "Hi", tags: { outbox_id: outboxId }, ...extra },
	});

	it("rejects an invalid signature", async () => {
		const res = await webhook({ type: "email.sent", data: {} }, { signature: "v1,AAAA" });
		expect(res.status).toBe(401);
	});

	it("rejects a signature made with another secret", async () => {
		const res = await webhook({ type: "email.sent", data: {} }, { secret: "whsec_b3RoZXItc2VjcmV0" });
		expect(res.status).toBe(401);
	});

	it("rejects a timestamp outside the 5 minute tolerance", async () => {
		const res = await webhook({ type: "email.sent", data: {} }, { timestamp: Math.floor(Date.now() / 1000) - 301 });
		expect(res.status).toBe(401);
	});

	it("accepts any matching v1 entry in a multi-signature header", async () => {
		const event = { type: "suppression.removed", data: { email: "x@y.test" } };
		const body = JSON.stringify(event);
		const ts = Math.floor(Date.now() / 1000);
		const good = await sign("msg_multi", ts, body);
		const res = await webhook(event, { id: "msg_multi", timestamp: ts, signature: `v1,AAAA ${good}` });
		expect(res.status).toBe(200);
	});

	it("stores Resend's message_id from email.sent (B2) and advances delivery state", async () => {
		const id = await sentMessage();
		const res = await webhook(emailEvent("email.sent", id, { message_id: "<0100abc@email.amazonses.com>" }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ received: true, results: ["applied"] });
		let email = await emailRow(id);
		expect(email.message_id).toBe("0100abc@email.amazonses.com");
		expect(email.delivery_status).toBe("sent");

		await webhook(emailEvent("email.delivered", id));
		expect((await emailRow(id)).delivery_status).toBe("delivered");

		// A late email.sent doesn't regress the state.
		await webhook(emailEvent("email.sent", id, { message_id: "<0100abc@email.amazonses.com>" }));
		email = await emailRow(id);
		expect(email.delivery_status).toBe("delivered");
	});

	it("marks a bounce", async () => {
		const id = await sentMessage();
		await webhook(emailEvent("email.bounced", id, { bounce: { type: "Permanent", subType: "General", message: "no such user" } }));
		expect((await emailRow(id)).delivery_status).toBe("bounced");
	});

	it("matches by provider email_id when tags are absent", async () => {
		const id = await sentMessage();
		const event = emailEvent("email.delivered", id);
		delete (event.data as Record<string, unknown>).tags;
		await webhook(event);
		expect((await emailRow(id)).delivery_status).toBe("delivered");
	});

	it("deduplicates on svix-id", async () => {
		const id = await sentMessage();
		const first = await webhook(emailEvent("email.delivered", id), { id: "msg_dup" });
		expect(await first.json()).toEqual({ received: true, results: ["applied"] });
		const second = await webhook(emailEvent("email.bounced", id), { id: "msg_dup" });
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ received: true, results: ["duplicate"] });
		expect((await emailRow(id)).delivery_status).toBe("delivered");
	});

	it("ignores events for unknown senders", async () => {
		const res = await webhook({ type: "email.delivered", data: { email_id: "x", from: "someone@else.test" } });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ received: true, results: [] });
	});

	it("mirrors suppression.added / suppression.removed for the compose warning", async () => {
		const check = async () =>
			((await (await api(`${base}/suppressions/check`, post({ emails: ["Gone@Other.test", "ok@other.test"] }))).json()) as {
				suppressed: Array<{ email: string; origin: string }>;
			}).suppressed;

		await webhook({ type: "suppression.added", created_at: new Date().toISOString(), data: { id: "s1", email: "gone@other.test", origin: "bounce", source_id: "e1", created_at: new Date().toISOString() } });
		expect(await check()).toEqual([{ email: "gone@other.test", origin: "bounce" }]);

		await webhook({ type: "suppression.removed", created_at: new Date().toISOString(), data: { id: "s1", email: "gone@other.test" } });
		expect(await check()).toEqual([]);
	});
});
