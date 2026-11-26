import { describe, expect, it } from "vitest";
import { MAILBOX, api, createMailbox } from "./helpers";
import { crossSiteReason } from "../workers/lib/same-origin";
import { attachmentHeaders } from "../workers/index";

const send = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}/emails`;
const req = (method: string, headers: Record<string, string> = {}) => new Request("https://inbox.test/x", { method, headers });

describe("cross-site request guard", () => {
	it("lets reads, same-origin writes and non-browser clients through", () => {
		expect(crossSiteReason(req("GET", { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.test" }))).toBeNull();
		expect(crossSiteReason(req("POST", { "Sec-Fetch-Site": "same-origin", Origin: "https://inbox.test" }))).toBeNull();
		expect(crossSiteReason(req("POST", { Origin: "https://inbox.test" }))).toBeNull();
		expect(crossSiteReason(req("POST"))).toBeNull();
	});

	it("refuses cross-site and same-site writes and WebSocket upgrades", () => {
		expect(crossSiteReason(req("POST", { "Sec-Fetch-Site": "cross-site" }))).toMatch(/cross-site/);
		// A sibling subdomain (e.g. the Drive app) is same-site but not same-origin.
		expect(crossSiteReason(req("DELETE", { "Sec-Fetch-Site": "same-site" }))).toMatch(/same-site/);
		expect(crossSiteReason(req("PUT", { Origin: "https://evil.test" }))).toMatch(/evil/);
		expect(crossSiteReason(req("POST", { Origin: "null" }))).toMatch(/null/);
		expect(crossSiteReason(req("GET", { Upgrade: "websocket", Origin: "https://evil.test" }))).toMatch(/evil/);
		expect(crossSiteReason(req("GET", { Upgrade: "websocket", Origin: "https://inbox.test" }))).toBeNull();
	});

	it("blocks a cross-site text/plain send before it reaches the API", async () => {
		await createMailbox();
		const body = JSON.stringify({ to: "x@evil.test", from: MAILBOX, subject: "hi", text: "hi" });
		const res = await api(send, { method: "POST", headers: { "Content-Type": "text/plain", Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" }, body });
		expect(res.status).toBe(403);
		const webhook = await api("/webhooks/resend", { method: "POST", body: "{}" });
		expect(webhook.status).not.toBe(403);
	});
});

describe("attachment download headers", () => {
	it("is always a download, never sniffed or rendered", () => {
		const h = attachmentHeaders("text/html", "page.html");
		expect(h.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(h.get("content-disposition")).toMatch(/^attachment;/);
		expect(h.get("x-content-type-options")).toBe("nosniff");
		expect(h.get("content-security-policy")).toMatch(/^sandbox/);
		expect(attachmentHeaders("image/png\r\nX-Evil: 1", "a.png").get("content-type")).toBe("application/octet-stream");
		expect(attachmentHeaders("Image/PNG", "a.png").get("content-type")).toBe("image/png");
	});

	it("handles non-Latin-1 filenames instead of throwing", () => {
		const h = attachmentHeaders("application/pdf", "文件 \"q\".pdf");
		expect(h.get("content-disposition")).toBe(`attachment; filename="__ _q_.pdf"; filename*=UTF-8''${encodeURIComponent("文件 \"q\".pdf")}`);
	});
});
