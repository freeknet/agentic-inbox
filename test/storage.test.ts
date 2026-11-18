import { runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Folders } from "../shared/folders";
import { createMailbox, mailboxStub } from "./helpers";

function sentRow(id: string, date: string) {
	return {
		id, subject: `s-${id}`, sender: "me@example.com", recipient: "x@y.test",
		date, body: "b", thread_id: id,
	};
}

describe("MailboxDO storage", () => {
	beforeEach(async () => {
		await createMailbox();
	});

	it("enforces foreign keys: deleting an email cascades to its attachment rows", async () => {
		const stub = mailboxStub();
		await stub.createEmail(Folders.INBOX, sentRow("e1", new Date().toISOString()), [
			{ id: "a1", email_id: "e1", filename: "f.txt", mimetype: "text/plain", size: 1 },
		]);
		await stub.deleteEmail("e1");
		const remaining = await runInDurableObject(stub, (_i, state) =>
			state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM attachments").one().n,
		);
		expect(remaining).toBe(0);
	});

	it("records applied migrations", async () => {
		const names = await runInDurableObject(mailboxStub(), (_i, state) =>
			[...state.storage.sql.exec<{ name: string }>("SELECT name FROM d1_migrations ORDER BY id")].map((r) => r.name),
		);
		expect(names[0]).toBe("1_initial_setup");
		expect(names).toContain("8_add_folder_date_indexes");
	});

	it("blocks sending after 20 sends in the last hour", async () => {
		const stub = mailboxStub();
		for (let i = 0; i < 20; i++) await stub.createEmail(Folders.SENT, sentRow(`r${i}`, new Date().toISOString()), []);
		expect(await stub.checkSendRateLimit()).toMatch(/per hour/);
	});

	// ISO dates ("…T…Z") are compared as strings against datetime('now') ("… …").
	// 'T' sorts after ' ', so every send since 00:00 UTC counts as "last hour".
	// Needs a timestamp >1h ago on the same UTC day, so skip in the first 2h of the day.
	const now = new Date();
	const earlyInUtcDay = now.getUTCHours() < 2;
	(earlyInUtcDay ? it.skip : it.fails)("KNOWN BUG: sends from more than an hour ago don't count toward the hourly limit", async () => {
		const stub = mailboxStub();
		const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 1)).toISOString();
		for (let i = 0; i < 20; i++) await stub.createEmail(Folders.SENT, sentRow(`old${i}`, startOfDay), []);
		expect(await stub.checkSendRateLimit()).toBeNull();
	});
});
