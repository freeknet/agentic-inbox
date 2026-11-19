import { beforeEach, describe, expect, it } from "vitest";
import { MAILBOX, api, createMailbox, deliver, mailboxStub, mime } from "./helpers";

const base = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}`;

async function setForwarding(forwarding: { enabled: boolean; email: string }) {
	const res = await api(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: { forwarding } }) });
	expect(res.status).toBe(200);
}

async function inboxCount() {
	return ((await mailboxStub().getEmails({ folder: "inbox" })) as unknown[]).length;
}

describe("inbound forwarding", () => {
	beforeEach(async () => {
		await createMailbox();
	});

	it("does nothing when forwarding is off", async () => {
		const { forwards } = await deliver(mime());
		expect(forwards).toEqual([]);
		expect(await inboxCount()).toBe(1);
	});

	it("keeps a copy and forwards the original when enabled", async () => {
		await setForwarding({ enabled: true, email: "Me@Elsewhere.test" });
		const { forwards, rejected } = await deliver(mime({ subject: "Fwd me" }));
		expect(rejected).toBeNull();
		expect(forwards).toEqual([{ to: "me@elsewhere.test", headers: { "x-forwarded-for": MAILBOX } }]);
		expect(await inboxCount()).toBe(1);
	});

	it("does not forward to the mailbox itself or when Email Routing says it can't", async () => {
		await setForwarding({ enabled: true, email: MAILBOX });
		expect((await deliver(mime({ messageId: "a@x.test" }))).forwards).toEqual([]);
		await setForwarding({ enabled: true, email: "me@elsewhere.test" });
		expect((await deliver(mime({ messageId: "b@x.test" }), { canBeForwarded: false })).forwards).toEqual([]);
	});

	it("still stores the message when forwarding fails", async () => {
		await setForwarding({ enabled: true, email: "unverified@elsewhere.test" });
		const { rejected } = await deliver(mime(), { forwardError: "destination address not verified" });
		expect(rejected).toBeNull();
		expect(await inboxCount()).toBe(1);
	});

	it("does not forward mail that was rejected", async () => {
		await setForwarding({ enabled: true, email: "me@elsewhere.test" });
		const { rejected, forwards } = await deliver(mime({ to: "nobody@example.com" }), { to: "nobody@example.com" });
		expect(rejected).toMatch(/^550/);
		expect(forwards).toEqual([]);
	});
});
