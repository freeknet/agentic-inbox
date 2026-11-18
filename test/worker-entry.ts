// Test entry for @cloudflare/vitest-plugin.
//
// The production entry (workers/app.ts) imports `virtual:react-router/server-build`,
// which only resolves inside the React Router Vite plugin, and enforces
// Cloudflare Access. Tests exercise the API app and the email handler directly,
// so this entry exports the same Durable Object classes plus a minimal handler.

import { app, receiveEmail } from "../workers/index";
import type { Env } from "../workers/types";

export { MailboxDO } from "../workers/durableObject";
export { EmailAgent } from "../workers/agent";
export { EmailMCP } from "../workers/mcp";

export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		await receiveEmail(event, env, ctx);
	},
} satisfies ExportedHandler<Env> & {
	email(event: { raw: ReadableStream; rawSize: number }, env: Env, ctx: ExecutionContext): Promise<void>;
};
