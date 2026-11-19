import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { MAILBOX, createMailbox, deliver, mailboxStub, mime } from "./helpers";

// Inbound pipeline (workers/index.ts receiveEmail → MailboxDO.ingestRaw).
// Started as characterization tests of upstream; the former "KNOWN BUG" cases
// (B14, envelope routing, Date header) were fixed in Phase 4.

async function inbox() {
	return (await mailboxStub().getEmails({ folder: "inbox" })) as Array<Record<string, any>>;
}

describe("inbound email", () => {
	beforeEach(async () => {
		await createMailbox();
	});

	it("stores a plain message in the Inbox", async () => {
		await deliver(mime({ subject: "Plain", messageId: "plain-1@sender.test" }));
		const emails = await inbox();
		expect(emails).toHaveLength(1);
		const full = (await mailboxStub().getEmail(emails[0].id)) as Record<string, any>;
		expect(full.subject).toBe("Plain");
		expect(full.sender).toBe("alice@sender.test");
		expect(full.recipient).toBe(MAILBOX);
		expect(full.message_id).toBe("plain-1@sender.test");
		expect(full.body).toContain("Hi there.");
		expect(full.read).toBe(false);
	});

	it("stores attachments in R2 and records their metadata", async () => {
		await deliver(
			mime({ attachment: { filename: "notes.txt", contentType: "text/plain", content: "attached bytes" } }),
		);
		const [email] = await inbox();
		const full = (await mailboxStub().getEmail(email.id)) as Record<string, any>;
		expect(full.attachments).toHaveLength(1);
		const att = full.attachments[0];
		expect(att.filename).toBe("notes.txt");
		expect(att.size).toBe("attached bytes".length);
		const obj = await env.BUCKET.get(`attachments/${email.id}/${att.id}/notes.txt`);
		expect(await obj?.text()).toBe("attached bytes");
	});

	it("rejects mail for a mailbox that does not exist", async () => {
		const { rejected } = await deliver(mime({ to: "nobody@example.com" }), { to: "nobody@example.com" });
		expect(rejected).toMatch(/^550/);
		const other = env.MAILBOX.get(env.MAILBOX.idFromName("nobody@example.com"));
		expect(await other.getEmails({ folder: "inbox" })).toHaveLength(0);
		expect(await inbox()).toHaveLength(0);
	});

	it("groups replies that share a References root", async () => {
		await deliver(mime({ subject: "Re: Plan", references: "<root@x.test>", inReplyTo: "root@x.test" }));
		await deliver(mime({ subject: "Re: Plan", references: "<root@x.test> <r1@x.test>", inReplyTo: "r1@x.test" }));
		const emails = await inbox();
		expect(new Set(emails.map((e) => e.thread_id)).size).toBe(1);
	});

	it("a reply joins the thread of the message it replies to (B14)", async () => {
		await deliver(mime({ subject: "Plan", messageId: "root-2@sender.test" }));
		await deliver(mime({ subject: "Re: Plan", inReplyTo: "root-2@sender.test", references: "<root-2@sender.test>" }));
		const emails = await inbox();
		expect(emails).toHaveLength(2);
		expect(new Set(emails.map((e) => e.thread_id)).size).toBe(1);
	});

	it("mail addressed to the mailbox only via Cc is delivered", async () => {
		await deliver(mime({ to: "someone-else@other.test", cc: MAILBOX }));
		expect(await inbox()).toHaveLength(1);
	});

	it("mail delivered when the mailbox is not the first To address", async () => {
		await deliver(mime({ to: `Other <other@other.test>, ${MAILBOX}` }));
		expect(await inbox()).toHaveLength(1);
	});

	it("the Date header is stored as the message date", async () => {
		await deliver(mime({ date: "Tue, 03 Nov 2026 10:00:00 +0000" }));
		const [email] = await inbox();
		expect(email.date).toBe("2026-11-03T10:00:00.000Z");
	});
});
