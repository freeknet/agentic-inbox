import { env } from "cloudflare:workers";
import { createExecutionContext, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../workers/types";
import { MAILBOX, api, createMailbox, deliver, mailboxStub, mime } from "./helpers";
import worker from "./worker-entry";

const base = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}`;
const json = (method: string, body: unknown): RequestInit => ({
	method,
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
});

async function inbox() {
	return (await mailboxStub().getEmails({ folder: "inbox" })) as Array<Record<string, any>>;
}

describe("inbound pipeline (Phase 4)", () => {
	beforeEach(async () => {
		await createMailbox();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("streams the raw .eml into R2 and records its key", async () => {
		const raw = mime({ subject: "Keep raw" });
		await deliver(raw);
		const [email] = await inbox();
		const full = (await mailboxStub().getEmail(email.id)) as Record<string, any>;
		expect(full.raw_key).toBe(`raw/${MAILBOX}/${email.id}.eml`);
		const obj = await env.BUCKET.get(full.raw_key);
		expect(await obj?.text()).toBe(raw);
	});

	it("rejects oversized mail before reading it", async () => {
		let rejected: string | null = null;
		const ctx = createExecutionContext();
		const raw = new ReadableStream<Uint8Array>({
			pull() {
				throw new Error("body must not be read");
			},
		});
		await worker.email(
			{ from: "a@x.test", to: MAILBOX, raw, rawSize: 26 * 1024 * 1024, setReject: (r: string) => { rejected = r; } },
			env as Env,
			ctx,
		);
		expect(rejected).toMatch(/^552/);
		expect(await inbox()).toHaveLength(0);
	});

	it("delivers Bcc mail (mailbox only in the envelope)", async () => {
		const { rejected } = await deliver(mime({ to: "someone@other.test" }));
		expect(rejected).toBeNull();
		expect(await inbox()).toHaveLength(1);
	});

	it("stores a plain-text body and uses it for the snippet", async () => {
		const raw = [
			"From: a@sender.test",
			`To: ${MAILBOX}`,
			"Subject: HTML only",
			"Message-ID: <html-1@sender.test>",
			"MIME-Version: 1.0",
			"Content-Type: text/html; charset=utf-8",
			"",
			"<html><head><style>p{color:red}</style></head><body><p>Hello <b>world</b></p></body></html>",
			"",
		].join("\r\n");
		await deliver(raw);
		const [email] = await inbox();
		expect(email.snippet).toBe("Hello world");
	});

	it("ingests a 5 MB message with ten attachments", async () => {
		const b = "MULTI";
		const chunk = "A".repeat(76);
		const blob = Array.from({ length: 6_500 }, () => chunk).join("\r\n"); // ~0.5 MB base64 each
		const parts = Array.from({ length: 10 }, (_, i) => [
			`--${b}`,
			`Content-Type: application/octet-stream; name="f${i}.bin"`,
			`Content-Disposition: attachment; filename="f${i}.bin"`,
			"Content-Transfer-Encoding: base64",
			"",
			blob,
		].join("\r\n"));
		const raw = [
			"From: a@sender.test", `To: ${MAILBOX}`, "Subject: Big", "Message-ID: <big@sender.test>", "MIME-Version: 1.0",
			`Content-Type: multipart/mixed; boundary="${b}"`, "", `--${b}`, "Content-Type: text/plain", "", "see attached",
			...parts, `--${b}--`, "",
		].join("\r\n");
		expect(raw.length).toBeGreaterThan(5_000_000);
		await deliver(raw);
		const [email] = await inbox();
		const full = (await mailboxStub().getEmail(email.id)) as Record<string, any>;
		expect(full.attachments).toHaveLength(10);
		const listed = await env.BUCKET.list({ prefix: `attachments/${email.id}/` });
		expect(listed.objects).toHaveLength(10);
	});

	it("stores 30 attachments without exceeding the 100-parameter limit (§A6)", async () => {
		const b = "MANY";
		const parts = Array.from({ length: 30 }, (_, i) => [
			`--${b}`,
			`Content-Type: text/plain; name="n${i}.txt"`,
			`Content-Disposition: attachment; filename="n${i}.txt"`,
			"",
			`file ${i}`,
		].join("\r\n"));
		const raw = [
			"From: a@sender.test", `To: ${MAILBOX}`, "Subject: Many", "Message-ID: <many@sender.test>", "MIME-Version: 1.0",
			`Content-Type: multipart/mixed; boundary="${b}"`, "", `--${b}`, "Content-Type: text/plain", "", "lots",
			...parts, `--${b}--`, "",
		].join("\r\n");
		await deliver(raw);
		const [email] = await inbox();
		const full = (await mailboxStub().getEmail(email.id)) as Record<string, any>;
		expect(full.attachments).toHaveLength(30);
	});

	it("threads an inbound reply to our sent message via Resend's message_id (B2 + B14)", async () => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ id: "re_t" }));
		const sent = (await (await api(`${base}/emails`, json("POST", { to: "bob@other.test", from: MAILBOX, subject: "Lunch?", text: "Noon?" }))).json()) as { id: string };
		const sentRow = (await mailboxStub().getEmail(sent.id)) as Record<string, any>;
		// What the email.sent webhook does: record the provider's Message-ID.
		await runInDurableObject(mailboxStub(), (_i, state) => {
			state.storage.sql.exec(`UPDATE emails SET message_id = 'ses-123@email.amazonses.com' WHERE id = ?`, sent.id);
		});
		await deliver(mime({ from: "bob@other.test", subject: "Re: Lunch?", inReplyTo: "ses-123@email.amazonses.com", references: "<ses-123@email.amazonses.com>" }));
		const [reply] = await inbox();
		expect(reply.thread_id).toBe(sentRow.thread_id);
	});

	it("subject fallback attaches to a single-message thread (B15)", async () => {
		// The window is 7 days of message Date, so use a current Date header.
		const date = new Date().toUTCString();
		await deliver(mime({ subject: "Weekend plans", messageId: "wp-1@sender.test", date }));
		await deliver(mime({ subject: "Re: Weekend plans", messageId: "wp-2@sender.test", date }));
		const emails = await inbox();
		expect(emails).toHaveLength(2);
		expect(new Set(emails.map((e) => e.thread_id)).size).toBe(1);
	});

	it("does not subject-thread across different correspondents", async () => {
		const date = new Date().toUTCString();
		await deliver(mime({ from: "a@one.test", subject: "Invoice", date }));
		await deliver(mime({ from: "b@two.test", subject: "Invoice", date }));
		const emails = await inbox();
		expect(new Set(emails.map((e) => e.thread_id)).size).toBe(2);
	});
});

describe("mailbox settings and lifecycle (Phase 4)", () => {
	beforeEach(async () => {
		await createMailbox();
	});

	it("validates settings and drops unknown keys (B13)", async () => {
		const bad = await api(base, json("PUT", { settings: { forwarding: { enabled: "yes", email: "nope" } } }));
		expect(bad.status).toBe(400);
		const ok = await api(base, json("PUT", { settings: { fromName: "Lawrence", junk: 1 } }));
		expect(ok.status).toBe(200);
		const saved = (await (await api(base)).json()) as { settings: Record<string, unknown> };
		expect(saved.settings).toEqual({ fromName: "Lawrence" });
	});

	it("purges Durable Object data and R2 blobs when a mailbox is deleted", async () => {
		await deliver(mime({ attachment: { filename: "a.txt", contentType: "text/plain", content: "bytes" } }));
		const [email] = await inbox();
		expect((await env.BUCKET.list({ prefix: `attachments/${email.id}/` })).objects).toHaveLength(1);

		const del = await api(base, { method: "DELETE" });
		expect(del.status).toBe(204);
		expect((await env.BUCKET.list({ prefix: `attachments/${email.id}/` })).objects).toHaveLength(0);
		expect((await env.BUCKET.list({ prefix: `raw/${MAILBOX}/` })).objects).toHaveLength(0);

		// Recreating the address starts empty and works.
		await createMailbox();
		expect(await inbox()).toHaveLength(0);
		await deliver(mime({ subject: "After purge" }));
		expect(await inbox()).toHaveLength(1);
	});
});
