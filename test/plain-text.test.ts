import { describe, expect, it } from "vitest";
import { isHtmlBody, linkify, plainTextToHtml } from "../app/lib/plainText";

describe("plain-text email rendering", () => {
	it("keeps an address inside a URL as part of that URL", () => {
		expect(linkify("https://x.com/unsub?e=bob@example.com")).toBe(
			'<a href="https://x.com/unsub?e=bob@example.com">https://x.com/unsub?e=bob@example.com</a>',
		);
	});

	it("links bare addresses and leaves trailing punctuation outside the link", () => {
		expect(linkify("Mail bob@example.com or see https://a.example/x.")).toBe(
			'Mail <a href="mailto:bob@example.com">bob@example.com</a> or see <a href="https://a.example/x">https://a.example/x</a>.',
		);
	});

	it("escapes markup in text bodies and keeps paragraphs and quotes", () => {
		const html = plainTextToHtml("Hi <b>there</b>?\nline two\n\n> quoted\n> more");
		expect(isHtmlBody("Hi <b>there</b>")).toBe(true);
		const text = plainTextToHtml("1 < 2 & 3\nnext\n\n> quoted\n> more");
		expect(text).toBe("<p>1 &lt; 2 &amp; 3<br>next</p>\n<blockquote>quoted<br>more</blockquote>");
		expect(html).toContain("<b>there</b>"); // bodies that look like HTML are left for DOMPurify
	});
});
