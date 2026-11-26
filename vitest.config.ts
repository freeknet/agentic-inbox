import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			// workers/app.ts needs the React Router virtual module; see test/worker-entry.ts.
			main: "./test/worker-entry.ts",
			// Never reach real Cloudflare services (Workers AI, send_email) from tests.
			remoteBindings: false,
			miniflare: {
				// Test-only values; real secrets are set with `wrangler secret put`.
				bindings: {
					// Production restricts mailbox creation to the real address; tests use example.com.
					DOMAINS: "example.com",
					EMAIL_ADDRESSES: [],
					RESEND_API_KEY: "re_test_key",
					RESEND_WEBHOOK_SECRET: "whsec_dGVzdC13ZWJob29rLXNlY3JldC0wMTIzNDU2Nzg5",
				},
				// A stand-in for the agentic-drive Worker behind the DRIVE service binding.
				workers: [
					{
						name: "agentic-drive",
						modules: true,
						compatibilityDate: "2026-11-01",
						scriptPath: "./test/fake-drive.mjs",
					},
				],
			},
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
