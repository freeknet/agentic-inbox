import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { MAILBOX, createMailbox, deliver, mailboxStub, mime } from "./helpers";

// Characterization tests for the upstream inbound pipeline (workers/index.ts
// receiveEmail). Tests named "KNOWN BUG" assert the *correct* behavior and are
// marked `it.fails`; when a later phase fixes the bug, vitest reports them as
// unexpectedly passing and the marker must be removed.

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

	it("ignores mail for a mailbox that does not exist", async () => {
		await deliver(mime({ to: "nobody@example.com" }));
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

	it.fails("KNOWN BUG: a reply joins the thread of the message it replies to", async () => {
		// Root gets thread_id = internal UUID; the reply gets thread_id = root's
		// Message-ID, so they never meet. Fixed in Phase 4 (thread lookup by message_id).
		await deliver(mime({ subject: "Plan", messageId: "root-2@sender.test" }));
		await deliver(mime({ subject: "Re: Plan", inReplyTo: "root-2@sender.test", references: "<root-2@sender.test>" }));
		const emails = await inbox();
		expect(emails).toHaveLength(2);
		expect(new Set(emails.map((e) => e.thread_id)).size).toBe(1);
	});

	it.fails("KNOWN BUG: mail addressed to the mailbox only via Cc is delivered", async () => {
		// Routing reads header To: only (workers/index.ts:355-363), never the
		// envelope recipient. Fixed in Phase 4 (route by message.to).
		await deliver(mime({ to: "someone-else@other.test", cc: MAILBOX }));
		expect(await inbox()).toHaveLength(1);
	});

	it.fails("KNOWN BUG: the Date header is stored as the message date", async () => {
		// Upstream stores receive time (workers/index.ts:399). Fixed in Phase 4.
		await deliver(mime({ date: "Tue, 03 Nov 2026 10:00:00 +0000" }));
		const [email] = await inbox();
		expect(email.date).toBe("2026-11-03T10:00:00.000Z");
	});
});
