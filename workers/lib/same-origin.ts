/**
 * Cross-site request guard (CSRF and cross-site WebSocket hijacking).
 *
 * Cloudflare Access authenticates with a cookie the browser attaches to every
 * request, including ones another website starts. CORS only hides responses;
 * a cross-site `text/plain` POST still runs, and a WebSocket handshake has no
 * same-origin rule at all. So state-changing requests and WebSocket upgrades
 * must come from this app's own origin.
 *
 * Browsers always send Sec-Fetch-Site (modern) or Origin on these requests.
 * Non-browser clients (MCP, Svix webhooks, tests) send neither and pass; they
 * still need their own credential (Access service token, Svix signature).
 */
import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Why this request looks cross-site, or null if it may proceed. */
export function crossSiteReason(req: Request): string | null {
	const upgrade = req.headers.get("upgrade")?.toLowerCase() === "websocket";
	if (!upgrade && SAFE_METHODS.has(req.method.toUpperCase())) return null;
	const site = req.headers.get("sec-fetch-site");
	if (site && site !== "same-origin" && site !== "none") return `Sec-Fetch-Site: ${site}`;
	const origin = req.headers.get("origin");
	if (origin && origin !== new URL(req.url).origin) return `Origin: ${origin}`;
	return null;
}

export const sameOriginOnly = createMiddleware(async (c, next) => {
	const reason = crossSiteReason(c.req.raw);
	if (reason) return c.text(`Cross-site request refused (${reason})`, 403);
	await next();
});
