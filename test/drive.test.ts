import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { MAILBOX, api, createMailbox, deliver, mailboxStub, mime } from "./helpers";

// The DRIVE service binding points at test/fake-drive.mjs (see vitest.config.ts).
const drive = () => (env as unknown as { DRIVE: { bytesOf(id: string): Promise<Uint8Array | null> } }).DRIVE;
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("Drive integration", () => {
	it("reports Drive as connected", async () => {
		const res = await api("/api/v1/drive");
		expect(await res.json()).toMatchObject({ available: true, url: "https://drive.example.com" });
	});

	it("uploads a large file to Drive in parts and returns a share link", async () => {
		const content = "0123456789abc"; // 13 bytes = parts of 5, 5, 3 in the fake
		const begin = (await (await api("/api/v1/drive/uploads", json({ name: "movie.mp4", size: 13, mime: "video/mp4" }))).json()) as {
			uploadId: string;
			partSize: number;
			partCount: number;
		};
		expect(begin.partCount).toBe(3);
		const parts = [];
		for (let p = 1; p <= begin.partCount; p++) {
			const chunk = content.slice((p - 1) * begin.partSize, p * begin.partSize);
			const res = await api(`/api/v1/drive/uploads/${begin.uploadId}/parts/${p}`, {
				method: "PUT",
				headers: { "Content-Length": String(chunk.length) },
				body: chunk,
			});
			expect(res.status).toBe(200);
			parts.push(await res.json());
		}
		const done = await api(`/api/v1/drive/uploads/${begin.uploadId}/complete`, json({ parts }));
		expect(done.status).toBe(201);
		const { file, link } = (await done.json()) as { file: { id: string; name: string }; link: { url: string; expiresAt: number } };
		expect(file.name).toBe("movie.mp4");
		expect(link.url).toMatch(/^https:\/\/drive\.example\.com\/s\//);
		expect(link.expiresAt).toBeGreaterThan(Date.now() + 29 * 86_400_000);
		expect(new TextDecoder().decode((await drive().bytesOf(file.id))!)).toBe(content);
	});

	it("passes Drive's errors through with their status", async () => {
		const begin = (await (await api("/api/v1/drive/uploads", json({ name: "a.bin", size: 7 }))).json()) as { uploadId: string };
		const bad = await api(`/api/v1/drive/uploads/${begin.uploadId}/parts/1`, { method: "PUT", headers: { "Content-Length": "3" }, body: "abc" });
		expect(bad.status).toBe(400);
		expect(((await bad.json()) as { error: string }).error).toBe("Part 1 must be 5 bytes");
		expect((await api("/api/v1/drive/files/not-a-uuid/link", json({}))).status).toBe(400);
	});

	it("saves a received attachment to Drive", async () => {
		await createMailbox();
		await deliver(mime({ attachment: { filename: "invoice.pdf", contentType: "application/pdf", content: "PDF bytes here" } }));
		const [email] = (await mailboxStub().getEmails({ folder: "inbox" })) as Array<{ id: string }>;
		const full = (await mailboxStub().getEmail(email.id)) as { attachments: Array<{ id: string }> };
		const base = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}/emails/${email.id}/attachments`;
		const res = await api(`${base}/${full.attachments[0].id}/save-to-drive`, { method: "POST" });
		expect(res.status).toBe(201);
		const { item, folder } = (await res.json()) as { item: { id: string; name: string; size: number }; folder: string };
		expect(item).toMatchObject({ name: "invoice.pdf", size: 14 });
		expect(folder).toBe("From email");
		expect(new TextDecoder().decode((await drive().bytesOf(item.id))!)).toBe("PDF bytes here");
		expect((await api(`${base}/${crypto.randomUUID()}/save-to-drive`, { method: "POST" })).status).toBe(404);
	});
});
