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

	it("full-text search: body words, prefixes, sender, long and odd queries (FTS5)", async () => {
		await deliver(mime({ subject: "Trip", text: "The ferry to Mackinac leaves at noon", from: "Pat <pat@ferries.test>" }));
		await deliver(mime({ subject: "Other", text: "nothing relevant here" }));
		const search = async (q: string) => {
			const res = await api(`${base}/search?${q}`);
			expect(res.status).toBe(200);
			return ((await res.json()) as { emails: Array<{ subject: string }> }).emails.map((e) => e.subject);
		};
		expect(await search("query=mackinac")).toEqual(["Trip"]);
		expect(await search("query=mack")).toEqual(["Trip"]);
		expect(await search("query=ferry%20noon")).toEqual(["Trip"]);
		expect(await search("query=ferry%20midnight")).toEqual([]);
		expect(await search("from=ferries.test")).toEqual(["Trip"]);
		// Over the 50-byte LIKE limit that broke the old search.
		expect(await search(`query=${encodeURIComponent("the ferry to mackinac leaves at noon ".repeat(3))}`)).toEqual(["Trip"]);
		// FTS5 operators are searched literally (as words), not parsed, so this is no error.
		expect(await search(`query=${encodeURIComponent('ferry" OR NEAR(* -')}`)).toEqual([]);
		expect(await search(`query=${encodeURIComponent('"ferry*" (noon')}`)).toEqual(["Trip"]);
	});

	it("keeps the search index in sync on update and delete", async () => {
		await deliver(mime({ subject: "Gone soon", text: "zebra" }));
		const { emails } = (await (await api(`${base}/search?query=zebra`)).json()) as { emails: Array<{ id: string }> };
		expect(emails).toHaveLength(1);
		await api(`${base}/emails/${emails[0].id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true, starred: true }) });
		expect(((await (await api(`${base}/search?query=zebra`)).json()) as { emails: unknown[] }).emails).toHaveLength(1);
		await api(`${base}/emails/${emails[0].id}`, { method: "DELETE" });
		expect(((await (await api(`${base}/search?query=zebra`)).json()) as { emails: unknown[] }).emails).toHaveLength(0);
	});

	it("reports storage and send-quota stats", async () => {
		await deliver(mime({ subject: "One" }));
		const res = await api(`${base}/stats`);
		expect(res.status).toBe(200);
		const { storage, quota } = (await res.json()) as { storage: Record<string, number>; quota: Record<string, number> };
		expect(storage.emails).toBe(1);
		expect(storage.databaseBytes).toBeGreaterThan(0);
		expect(storage.databaseLimitBytes).toBe(1024 * 1024 * 1024);
		expect(quota).toMatchObject({ used: 0, limit: 100 });
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

	it("returns 400 with issues for an invalid body", async () => {
		const res = await api(`${base}/emails`, json({ to: "not-an-address", from: MAILBOX, subject: "x" }));
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string; issues: unknown };
		expect(body.error).toBe("Invalid request");
		expect(body.issues).toBeTruthy();
	});

	it("rejects a From address that is not the mailbox", async () => {
		const res = await api(
			`${base}/emails`,
			json({ to: "bob@other.test", from: "spoof@example.com", subject: "x", text: "y" }),
		);
		expect(res.status).toBe(400);
	});
});
