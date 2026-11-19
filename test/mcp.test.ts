import { env, createExecutionContext } from "cloudflare:test";
import { createMcpHandler } from "agents/mcp/server";
import { describe, expect, it } from "vitest";
import { createEmailMcpServer } from "../workers/mcp";
import { MAILBOX, createMailbox, deliver, mime } from "./helpers";

// The /mcp endpoint as workers/app.ts serves it: stateless, MCP SDK v2.
async function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
	const handler = createMcpHandler(() => createEmailMcpServer(env as never), { route: "/mcp" });
	const res = await handler(
		new Request("http://localhost/mcp", {
			method: "POST",
			headers: { Host: "localhost", "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
			body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
		}),
		env,
		createExecutionContext(),
	);
	const text = await res.text();
	// The response is either JSON or a single SSE event.
	const json = text.trimStart().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:")) ?? "").slice(5);
	return { status: res.status, body: JSON.parse(json) as { result?: any; error?: any } };
}

describe("MCP endpoint", () => {
	it("answers initialize from a 2025-protocol client", async () => {
		const { status, body } = await rpc("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "test", version: "1" },
		});
		expect(status).toBe(200);
		expect(body.result.serverInfo.name).toBe("agentic-inbox");
	});

	it("lists all 13 email tools with their input schemas", async () => {
		const { body } = await rpc("tools/list");
		const tools = body.result.tools as Array<{ name: string; inputSchema: { properties?: Record<string, unknown> } }>;
		expect(tools.map((t) => t.name).sort()).toEqual([
			"create_draft", "delete_email", "draft_reply", "get_email", "get_thread", "list_emails", "list_mailboxes",
			"mark_email_read", "move_email", "search_emails", "send_email", "send_reply", "update_draft",
		]);
		expect(Object.keys(tools.find((t) => t.name === "list_emails")!.inputSchema.properties ?? {})).toEqual(["mailboxId", "folder", "limit", "page"]);
	});

	it("runs a tool against the mailbox", async () => {
		await createMailbox();
		await deliver(mime({ subject: "Hello over MCP" }));
		const { body } = await rpc("tools/call", { name: "list_emails", arguments: { mailboxId: MAILBOX } });
		expect(body.result.isError).toBeFalsy();
		expect(body.result.content[0].text).toContain("Hello over MCP");
	});

	it("rejects invalid arguments", async () => {
		const { body } = await rpc("tools/call", { name: "send_email", arguments: { mailboxId: MAILBOX, to: "not-an-email", subject: "x", bodyHtml: "x" } });
		expect(body.error ?? body.result?.isError).toBeTruthy();
	});
});
