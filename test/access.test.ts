import { describe, expect, it } from "vitest";
import { identify, isAllowed } from "../workers/lib/access";

describe("Access identities (B5)", () => {
	const user = identify({ email: "me@example.com" });
	const svc = identify({ common_name: "abc123.access" });

	it("tells users from service tokens", () => {
		expect(user).toEqual({ kind: "user", email: "me@example.com" });
		expect(svc).toEqual({ kind: "service", clientId: "abc123.access" });
		expect(identify({ sub: "" })).toEqual({ kind: "unknown" });
	});

	it("lets users reach everything", () => {
		expect(isAllowed(user, "/api/v1/mailboxes")).toBe(true);
		expect(isAllowed(user, "/mcp")).toBe(true);
	});

	it("limits service tokens to /mcp", () => {
		expect(isAllowed(svc, "/mcp")).toBe(true);
		expect(isAllowed(svc, "/mcp/message")).toBe(true);
		expect(isAllowed(svc, "/mcpx")).toBe(false);
		expect(isAllowed(svc, "/api/v1/mailboxes")).toBe(false);
		expect(isAllowed(svc, "/")).toBe(false);
	});

	it("pins service tokens to MCP_SERVICE_TOKEN_IDS when set", () => {
		expect(isAllowed(svc, "/mcp", "other.access, abc123.access")).toBe(true);
		expect(isAllowed(svc, "/mcp", "other.access")).toBe(false);
	});

	it("rejects tokens with neither claim", () => {
		expect(isAllowed(identify({}), "/mcp")).toBe(false);
	});
});
