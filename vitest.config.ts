import { cloudflareTest } from "@cloudflare/vitest-plugin";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		tsconfigPaths(),
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			// workers/app.ts needs the React Router virtual module; see test/worker-entry.ts.
			main: "./test/worker-entry.ts",
			// Never reach real Cloudflare services (Workers AI, send_email) from tests.
			remoteBindings: false,
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
