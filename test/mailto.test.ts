import { describe, expect, it } from "vitest";
import { parseMailto, prefillFromShare } from "../app/lib/mailto";

describe("mailto links", () => {
	it("reads addresses, subject, body, cc and bcc", () => {
		expect(parseMailto("mailto:a@x.com,b@x.com?subject=Hello%20there&CC=c@x.com&bcc=d@x.com&body=Line%201%0ALine%202")).toEqual({
			to: "a@x.com, b@x.com",
			cc: "c@x.com",
			bcc: "d@x.com",
			subject: "Hello there",
			text: "Line 1\nLine 2",
		});
	});

	it("keeps a literal plus and joins extra to fields", () => {
		expect(parseMailto("mailto:bob+news@x.com?to=amy@x.com&subject=1+1")).toMatchObject({ to: "bob+news@x.com, amy@x.com", subject: "1+1" });
	});

	it("copes with a bare scheme and bad escapes", () => {
		expect(parseMailto("mailto:")).toEqual({ to: undefined, cc: undefined, bcc: undefined, subject: undefined, text: undefined });
		expect(parseMailto("mailto:?subject=100%")).toMatchObject({ subject: "100%" });
	});
});

describe("shared text", () => {
	it("uses the title as subject and doesn't repeat a link already in the text", () => {
		expect(prefillFromShare({ title: "Look", text: "see https://a.example", url: "https://a.example" })).toEqual({
			subject: "Look",
			text: "see https://a.example",
			files: undefined,
		});
		expect(prefillFromShare({ text: "hi", url: "https://b.example" }).text).toBe("hi\n\nhttps://b.example");
	});
});
