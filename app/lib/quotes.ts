/**
 * Splits the quoted history off the end of a reply, as Gmail does behind its
 * "•••" button. Recognises Gmail, Apple Mail, Outlook, Yahoo and Thunderbird
 * quote markup, this app's own replies, and plain-text "> " quotes. Only a
 * quote at the end of the message is trimmed, and never the whole message.
 * Browser only (DOMParser); the HTML is parsed inert, nothing loads or runs.
 */
const MARKERS = "#divRplyFwdMsg, #appendonsend, .gmail_quote, .yahoo_quoted, .moz-cite-prefix, div[id^='mail-editor-reference-message']";
const ATTRIBUTION = /(wrote|schrieb|a écrit|escribió|scrisse|schreef|skrev|kirjoitti|napisał|написал|escreveu)[^:]{0,40}:\s*$/i;

export function splitQuoted(html: string): { main: string; quoted: string | null } {
	if (typeof DOMParser === "undefined" || !html) return { main: html, quoted: null };
	const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
	const body = doc.body;
	const textAfter = (node: Node) => {
		const r = doc.createRange();
		r.setStartAfter(node);
		r.setEndAfter(body.lastChild ?? node);
		return r.toString().trim();
	};

	// A client's reply marker: everything from it on is history.
	let start: Element | null = body.querySelector(MARKERS);
	// Otherwise a blockquote that ends the message (Apple, plain text, this app).
	if (!start) {
		const quotes = [...body.querySelectorAll("blockquote")].filter((q) => !q.parentElement?.closest("blockquote"));
		start = quotes.reverse().find((q) => textAfter(q) === "") ?? null;
		// "On …, X wrote:" just above it belongs to the quote.
		const prev = start?.previousElementSibling;
		if (start && prev && (prev.textContent ?? "").length < 300 && ATTRIBUTION.test(prev.textContent ?? "")) start = prev;
	}
	if (!start) return { main: html, quoted: null };

	const range = doc.createRange();
	range.setStartBefore(start);
	range.setEndAfter(body.lastChild ?? start);
	const holder = doc.createElement("div");
	holder.appendChild(range.cloneContents());
	range.deleteContents();
	// Leftover empty wrappers and trailing breaks.
	const hasContent = (body.textContent ?? "").trim() !== "" || !!body.querySelector("img");
	if (!hasContent) return { main: html, quoted: null };
	return { main: body.innerHTML.replace(/(\s|<br\s*\/?>)+$/i, ""), quoted: holder.innerHTML };
}

/**
 * HTML with no colours or backgrounds of its own (what Gmail and most clients
 * send for a typed message) can follow the app's dark theme like plain text.
 * Designed mail (newsletters, receipts) keeps its own light page.
 */
export function isSimpleHtml(html: string): boolean {
	return !/<style|bgcolor\s*=|<font[^>]+color|(?<![-\w])(color|background(-color|-image)?)\s*:/i.test(html);
}
