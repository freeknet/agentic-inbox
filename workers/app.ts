// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import { createContext, createRequestHandler, RouterContextProvider } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { createMcpHandler } from "agents/mcp/server";
import { createEmailMcpServer } from "./mcp";
import { identify, isAllowed } from "./lib/access";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";

/**
 * Cloudflare bindings for React Router loaders/actions. React Router 8 removed
 * AppLoadContext; read this with `context.get(cloudflareContext)`.
 */
export const cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>();

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

function getAccessUrls(teamDomain: string) {
	const certsPath = "/cdn-cgi/access/certs";
	const teamUrl = new URL(teamDomain);
	const issuer = teamUrl.origin;
	const certsUrl = teamUrl.pathname.endsWith(certsPath)
		? teamUrl
		: new URL(certsPath, issuer);

	return { issuer, certsUrl };
}

// B4: one JWKS per team domain per isolate. jose caches and refreshes keys
// inside the set, so rebuilding it per request threw that cache away.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwks(certsUrl: URL) {
	let jwks = jwksCache.get(certsUrl.href);
	if (!jwks) {
		jwks = createRemoteJWKSet(certsUrl);
		jwksCache.set(certsUrl.href, jwks);
	}
	return jwks;
}

// Main app that wraps the API and adds React Router fallback
const app = new Hono<{ Bindings: Env }>();

// Cloudflare Access JWT validation middleware (production only)
app.use("*", async (c, next) => {
	// Skip validation in development
	if (import.meta.env.DEV) {
		return next();
	}

	// Resend webhooks come through an Access Bypass app on this exact path and
	// authenticate with their Svix signature instead (B3). Exact match only.
	if (c.req.path === "/webhooks/resend") {
		return next();
	}

	const { POLICY_AUD, TEAM_DOMAIN } = c.env;

	// Fail closed in production if Access is not configured.
	if (!POLICY_AUD || !TEAM_DOMAIN) {
		return c.text(
			"Cloudflare Access must be configured in production. Set POLICY_AUD and TEAM_DOMAIN.",
			500,
		);
	}

	const token = c.req.header("cf-access-jwt-assertion");
	if (!token) {
		return c.text("Missing required CF Access JWT", 403);
	}

	let payload: JWTPayload;
	try {
		const { issuer, certsUrl } = getAccessUrls(TEAM_DOMAIN);
		({ payload } = await jwtVerify(token, getJwks(certsUrl), {
			issuer,
			audience: POLICY_AUD,
		}));
	} catch {
		return c.text("Invalid or expired Access token", 403);
	}

	// Service tokens (MCP clients, B5) may only reach /mcp.
	if (!isAllowed(identify(payload), c.req.path, (c.env as { MCP_SERVICE_TOKEN_IDS?: string }).MCP_SERVICE_TOKEN_IDS)) {
		return c.text("This Access identity may not use this path", 403);
	}

	// Authorization model note: once a teammate passes the shared Cloudflare
	// Access policy, they can access all mailboxes in this app by design.
	return next();
});

// MCP server endpoint — used by AI coding tools (ProtoAgent, Claude Code, Cursor, etc.)
// Must be before API routes and React Router catch-all
// Stateless (MCP SDK v2): a fresh server per request, no session Durable Object.
// Access has already authenticated the caller above.
app.all("/mcp", async (c) => {
	const handler = createMcpHandler(() => createEmailMcpServer(c.env), { route: "/mcp" });
	return handler(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});

// Mount the API routes
app.route("/", apiApp);

// Agent WebSocket routing - must be before React Router catch-all
app.all("/agents/*", async (c) => {
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	const context = new RouterContextProvider();
	context.set(cloudflareContext, { env: c.env, ctx: c.executionCtx as ExecutionContext });
	return requestHandler(c.req.raw, context);
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
		try {
			await receiveEmail(message, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			// Swallowing the error would silently drop the email.
			throw e;
		}
	},
};
