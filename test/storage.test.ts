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
		expect(names).toContain("9_add_outbox");
	});
});
