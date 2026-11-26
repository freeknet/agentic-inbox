/** Fields for a new message, from a mailto: link or something shared to the app. */
export interface ComposePrefill {
	to?: string;
	cc?: string;
	bcc?: string;
	subject?: string;
	/** Plain text; shown as the start of the body. */
	text?: string;
	files?: File[];
}

/**
 * Parses a mailto: URL (RFC 6068). Addresses before the "?" and any "to"
 * fields are joined; subject, body, cc and bcc are read case-insensitively.
 * "+" is a literal plus in mailto, not a space.
 */
export function parseMailto(href: string): ComposePrefill {
	const raw = href.trim().replace(/^mailto:/i, "");
	const q = raw.indexOf("?");
	const path = q === -1 ? raw : raw.slice(0, q);
	const query = q === -1 ? "" : raw.slice(q + 1);
	const decode = (s: string) => {
		try {
			return decodeURIComponent(s);
		} catch {
			return s;
		}
	};
	const out: Record<string, string[]> = { to: [], cc: [], bcc: [], subject: [], body: [] };
	if (path) out.to.push(decode(path));
	for (const pair of query.split("&")) {
		if (!pair) continue;
		const eq = pair.indexOf("=");
		const key = decode(eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
		const value = decode(eq === -1 ? "" : pair.slice(eq + 1));
		if (key in out && value) out[key].push(value);
	}
	const list = (v: string[]) => v.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean).join(", ") || undefined;
	return {
		to: list(out.to),
		cc: list(out.cc),
		bcc: list(out.bcc),
		subject: out.subject[0] || undefined,
		text: out.body.join("\n") || undefined,
	};
}

/** Text shared from another app: the title becomes the subject; text and link the body. */
export function prefillFromShare(shared: { title?: string; text?: string; url?: string; files?: File[] }): ComposePrefill {
	const text = shared.text?.trim() ?? "";
	const url = shared.url?.trim() ?? "";
	const body = [text, url && !text.includes(url) ? url : ""].filter(Boolean).join("\n\n");
	return { subject: shared.title?.trim() || undefined, text: body || undefined, files: shared.files?.length ? shared.files : undefined };
}
