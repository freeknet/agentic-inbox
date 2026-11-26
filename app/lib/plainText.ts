/**
 * Emails that only carry a text part arrive as raw text. Rendering that in an
 * HTML document collapses the line breaks, so convert it to markup first:
 * blank lines become paragraphs, single newlines become <br>, quoted lines
 * become a blockquote, and URLs and addresses become links.
 */

const LOOKS_LIKE_HTML =
	/<(?:html|body|head|p|div|br|table|tr|td|th|img|a|ul|ol|li|h[1-6]|blockquote|span|strong|b|em|i|pre|code|style|hr)\b[^>]*>/i;

const escape = (text: string) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/**
 * Linkify text that has already been HTML-escaped. URLs and addresses are
 * matched in one pass, so an address inside a URL (?e=bob@example.com) stays
 * part of that URL instead of getting a link nested in the href.
 */
export function linkify(text: string): string {
	return text.replace(/(https?:\/\/[^\s<>"]+)|(\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b)/gi, (raw, url: string | undefined) => {
		if (!url) return `<a href="mailto:${raw}">${raw}</a>`;
		const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] ?? "";
		const href = trailing ? raw.slice(0, -trailing.length) : raw;
		return `<a href="${href}">${href}</a>${trailing}`;
	});
}

export function isHtmlBody(body: string): boolean {
	return LOOKS_LIKE_HTML.test(body ?? "");
}

/** Convert a plain-text body into paragraphs; leave HTML bodies untouched. */
export function plainTextToHtml(body: string): string {
	const text = (body ?? "").replace(/\r\n?/g, "\n").trim();
	if (!text) return "";
	if (isHtmlBody(text)) return text;

	return text
		.split(/\n{2,}/)
		.map((block) => {
			const lines = block.split("\n");
			const quoted = lines.every((line) => line.trimStart().startsWith(">"));
			const source = quoted ? lines.map((line) => line.replace(/^\s*>\s?/, "")).join("\n") : block;
			const html = linkify(escape(source)).replace(/\n/g, "<br>");
			return quoted ? `<blockquote>${html}</blockquote>` : `<p>${html}</p>`;
		})
		.join("\n");
}
