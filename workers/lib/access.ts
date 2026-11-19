/**
 * Who a verified Cloudflare Access JWT belongs to, and what it may reach.
 *
 * A person who logs in gets a token with an `email` claim. An Access
 * service token (CF-Access-Client-Id / CF-Access-Client-Secret headers, used
 * by MCP clients that can't do a browser login, plan B5) gets a token with
 * `common_name` = the client id and no email. Service tokens may only use the
 * MCP endpoint, not the web app or its REST API.
 */
import type { JWTPayload } from "jose";

export type AccessIdentity = { kind: "user"; email: string } | { kind: "service"; clientId: string } | { kind: "unknown" };

export function identify(payload: JWTPayload): AccessIdentity {
	const email = typeof payload.email === "string" ? payload.email : "";
	if (email) return { kind: "user", email };
	const cn = typeof payload.common_name === "string" ? payload.common_name : "";
	if (cn) return { kind: "service", clientId: cn };
	return { kind: "unknown" };
}

export function isMcpPath(path: string): boolean {
	return path === "/mcp" || path.startsWith("/mcp/");
}

/**
 * Optional MCP_SERVICE_TOKEN_IDS (comma-separated client ids) pins which
 * service tokens may use /mcp; when unset, any token the Access policy
 * admits is accepted.
 */
export function isAllowed(identity: AccessIdentity, path: string, allowedServiceIds?: string): boolean {
	if (identity.kind === "user") return true;
	if (identity.kind === "service") {
		if (!isMcpPath(path)) return false;
		const ids = (allowedServiceIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
		return ids.length === 0 || ids.includes(identity.clientId);
	}
	return false;
}
