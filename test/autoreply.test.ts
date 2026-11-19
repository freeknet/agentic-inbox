import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAILBOX, api, createMailbox, deliver, mailboxStub, mime } from "./helpers";
import { decideAutoReply } from "../workers/durableObject/autoreply";

const base = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}`;

async function setAutoReply(autoReply: Record<string, unknown>) {
	const res = await api(base, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ settings: { fromName: "Me", autoReply } }),
	});
	expect(res.status).toBe(200);
}

function sentRows() {
	return runInDurableObject(mailboxStub(), (_i, state) =>
		[...state.storage.sql.exec(
			`SELECT e.id, e.recipient, e.subject, e.thread_id, e.in_reply_to, o.payload
			 FROM emails e JOIN outbox o ON o.id = e.id WHERE e.folder_id = 'sent'`,
		)] as Array<Record<string, any>>,
	);
}

describe("vacation auto-reply", () => {
	beforeEach(async () => {
		await createMailbox();
		// The alarm would try Resend; nothing here needs it to succeed.
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ id: "re_auto" }));
	});
	afterEach(() => vi.restoreAllMocks());

	it("replies once per sender through the outbox, threaded, with Auto-Submitted", async () => {
		await setAutoReply({ enabled: true, subject: "", message: "Away until Monday.\nBack soon." });
		await deliver(mime({ from: "Bob <bob@friend.test>", subject: "Dinner?", messageId: "m1@friend.test" }));

		const rows = await sentRows();
		expect(rows).toHaveLength(1);
		const payload = JSON.parse(rows[0].payload);
		expect(rows[0]).toMatchObject({ recipient: "bob@friend.test", subject: "Re: Dinner?", in_reply_to: "m1@friend.test" });
		expect(payload.from).toBe(`"Me" <${MAILBOX}>`);
		expect(payload.headers).toMatchObject({ "Auto-Submitted": "auto-replied", "In-Reply-To": "<m1@friend.test>" });
		expect(payload.text).toBe("Away until Monday.\nBack soon.");
		expect(payload.html).toBe("<div>Away until Monday.<br>Back soon.</div>");

		// The sender's next message within the interval gets no second reply.
		await deliver(mime({ from: "bob@friend.test", subject: "Also", messageId: "m2@friend.test" }));
		expect(await sentRows()).toHaveLength(1);
	});

	it("does not reply to lists, automated mail, robots or when disabled", async () => {
		await setAutoReply({ enabled: true, subject: "Out of office", message: "Away." });
		await deliver(mime({ from: "news@list.test", extraHeaders: ["List-Id: <news.list.test>"] }));
		await deliver(mime({ from: "bot@svc.test", extraHeaders: ["Auto-Submitted: auto-generated"] }));
		await deliver(mime({ from: "promo@shop.test", extraHeaders: ["Precedence: bulk"] }));
		await deliver(mime({ from: "no-reply@service.test" }));
		await deliver(mime({ from: "MAILER-DAEMON@mx.test" }));
		expect(await sentRows()).toHaveLength(0);

		await setAutoReply({ enabled: false, subject: "", message: "Away." });
		await deliver(mime({ from: "carol@friend.test" }));
		expect(await sentRows()).toHaveLength(0);
	});

	it("respects the start and end times", () => {
		const now = Date.parse("2026-11-19T12:00:00Z");
		const common = { mailbox: MAILBOX, sender: "a@b.test", headers: [], nowMs: now, lastRepliedAt: null };
		const s = (startsAt: string, endsAt: string) => ({ enabled: true, message: "x", startsAt, endsAt });
		expect(decideAutoReply({ ...common, settings: s("2026-11-20T00:00:00Z", "") })).toMatchObject({ reply: false, reason: "not started" });
		expect(decideAutoReply({ ...common, settings: s("", "2026-11-18T00:00:00Z") })).toMatchObject({ reply: false, reason: "ended" });
		expect(decideAutoReply({ ...common, settings: s("2026-11-18T00:00:00Z", "2026-11-20T00:00:00Z") })).toEqual({ reply: true });
		expect(decideAutoReply({ ...common, settings: s("", ""), lastRepliedAt: now - 5 * 86_400_000 })).toEqual({ reply: true });
	});

	it("rejects invalid auto-reply dates in settings", async () => {
		const res = await api(base, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ settings: { autoReply: { enabled: true, subject: "", message: "x", startsAt: "tomorrow" } } }),
		});
		expect(res.status).toBe(400);
	});
});
