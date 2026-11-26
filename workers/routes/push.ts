/**
 * Push notifications for the installed app: the browser subscribes with the
 * VAPID public key, and each new inbox message is pushed to every saved
 * subscription. Without the VAPID_PRIVATE_KEY secret, push is simply off.
 */
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { MailboxDO } from "../durableObject";
import type { MailboxContext } from "../lib/mailbox";
import { isPushEndpoint, loadVapidKeys, sendPush } from "../lib/webpush";
import type { Env } from "../types";

type AppContext = Context<MailboxContext>;

const b64 = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).max(200);
const SubscriptionBody = z.object({
	endpoint: z.string().max(2048).refine(isPushEndpoint, "Not a browser push service"),
	keys: z.object({ p256dh: b64, auth: b64 }),
});
const EndpointBody = z.object({ endpoint: z.string().max(2048) });

async function vapid(env: Env) {
	if (!env.VAPID_PRIVATE_KEY) return null;
	try {
		return await loadVapidKeys(env.VAPID_PRIVATE_KEY);
	} catch (e) {
		console.error("VAPID_PRIVATE_KEY is unusable:", (e as Error).message);
		return null;
	}
}

export function registerPushRoutes(app: Hono<MailboxContext>) {
	/** The key browsers subscribe with, or null when push isn't set up. */
	app.get("/api/v1/push", async (c) => {
		const keys = await vapid(c.env);
		return c.json({ publicKey: keys?.publicKey ?? null });
	});

	app.post("/api/v1/mailboxes/:mailboxId/push-subscriptions", async (c: AppContext) => {
		if (!(await vapid(c.env))) return c.json({ error: "Push notifications aren't set up on the server" }, 404);
		const body = SubscriptionBody.parse(await c.req.json());
		await c.var.mailboxStub.savePushSubscription({ endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth });
		return c.json({ ok: true });
	});

	app.delete("/api/v1/mailboxes/:mailboxId/push-subscriptions", async (c: AppContext) => {
		const { endpoint } = EndpointBody.parse(await c.req.json());
		await c.var.mailboxStub.deletePushSubscription(endpoint);
		return c.json({ ok: true });
	});
}

/** "Ann Lee <ann@x.com>" → "Ann Lee"; a bare address stays as it is. */
export function senderLabel(sender: string): string {
	const m = sender.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
	if (!m) return sender.trim();
	return m[1].trim() || m[2].trim();
}

/** Tells every subscribed browser about a new inbox message. Never throws. */
export async function notifyNewMail(
	env: Env,
	stub: DurableObjectStub<MailboxDO>,
	mailboxId: string,
	email: { emailId: string; sender: string; subject: string },
) {
	try {
		const keys = await vapid(env);
		if (!keys) return;
		const subs = await stub.listPushSubscriptions();
		if (!subs.length) return;
		const folders = (await stub.getFolders()) as Array<{ id: string; unreadCount?: number }>;
		const badge = folders.find((f) => f.id === "inbox")?.unreadCount ?? 0;
		const payload = {
			title: senderLabel(email.sender) || "New email",
			body: email.subject || "(no subject)",
			tag: email.emailId,
			url: `/mailbox/${encodeURIComponent(mailboxId)}/emails/inbox?open=${encodeURIComponent(email.emailId)}`,
			badge,
			timestamp: Date.now(),
		};
		const results = await Promise.all(
			subs.map((s) => sendPush(s, payload, keys, `mailto:${mailboxId}`).catch((e) => (console.error("Push failed:", (e as Error).message), "failed" as const))),
		);
		await Promise.all(subs.map((s, i) => (results[i] === "gone" ? stub.deletePushSubscription(s.endpoint) : null)));
	} catch (e) {
		console.error("New-mail notification failed:", (e as Error).message);
	}
}
