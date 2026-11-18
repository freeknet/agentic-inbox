import { beforeEach, describe, expect, it } from "vitest";
import { MAILBOX, api, createMailbox, deliver, mime } from "./helpers";

const json = (body: unknown): RequestInit => ({
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body),
});
const base = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}`;

describe("REST API", () => {
	beforeEach(async () => {
		await createMailbox();
	});

	it("rejects creating a mailbox twice", async () => {
		const res = await api("/api/v1/mailboxes", json({ email: MAILBOX, name: "Again" }));
		expect(res.status).toBe(409);
	});

	it("returns 404 for an unknown mailbox", async () => {
		const res = await api(`/api/v1/mailboxes/${encodeURIComponent("ghost@example.com")}/folders`);
		expect(res.status).toBe(404);
	});

	it("lists the default folders", async () => {
		const res = await api(`${base}/folders`);
		const ids = ((await res.json()) as Array<{ id: string }>).map((f) => f.id).sort();
		expect(ids).toEqual(["archive", "draft", "inbox", "sent", "spam", "trash"]);
	});

	it("replaces a draft when saved again with draft_id", async () => {
		const first = (await (await api(`${base}/drafts`, json({ subject: "v1", body: "one" }))).json()) as { id: string };
		await api(`${base}/drafts`, json({ subject: "v2", body: "two", draft_id: first.id }));
		const res = await api(`${base}/emails?folder=draft`);
		const { emails } = (await res.json()) as { emails: Array<{ subject: string }> };
		expect(emails.map((e) => e.subject)).toEqual(["v2"]);
	});

	it("searches by subject", async () => {
		await deliver(mime({ subject: "Quarterly invoice" }));
		await deliver(mime({ subject: "Lunch" }));
		const res = await api(`${base}/search?query=invoice`);
		const { emails } = (await res.json()) as { emails: Array<{ subject: string }> };
		expect(emails.map((e) => e.subject)).toEqual(["Quarterly invoice"]);
	});

	it("records a sent email in Sent", async () => {
		const res = await api(
			`${base}/emails`,
			json({ to: "bob@other.test", from: MAILBOX, subject: "Hi Bob", text: "hello" }),
		);
		expect(res.status).toBe(202);
		const list = await api(`${base}/emails?folder=sent`);
		const { emails } = (await list.json()) as { emails: Array<{ subject: string; recipient: string }> };
		expect(emails).toHaveLength(1);
		expect(emails[0]).toMatchObject({ subject: "Hi Bob", recipient: "bob@other.test" });
	});

	it("rejects a From address that is not the mailbox", async () => {
		const res = await api(
			`${base}/emails`,
			json({ to: "bob@other.test", from: "spoof@example.com", subject: "x", text: "y" }),
		);
		expect(res.status).toBe(400);
	});
});
