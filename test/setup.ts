import { reset } from "cloudflare:test";
import { afterEach } from "vitest";

// Storage is isolated per test file, not per test; wipe R2 and Durable Object
// state after every test so each one starts from an empty account.
afterEach(async () => {
	await reset();
});
