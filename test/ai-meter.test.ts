import { describe, expect, it } from "vitest";
import { meterAi } from "../workers/lib/ai-meter";
import { neuronsFor } from "../shared/ai-models";
import { MAILBOX, api, createMailbox, mailboxStub } from "./helpers";

const base = `/api/v1/mailboxes/${encodeURIComponent(MAILBOX)}`;

function fakeAi(result: unknown): Ai {
	return { run: async () => result, models: async () => [] } as unknown as Ai;
}

describe("Neuron meter", () => {
	it("records usage from a plain response", async () => {
		const calls: Array<[string, number, number]> = [];
		const ai = meterAi(fakeAi({ response: "NO", usage: { prompt_tokens: 120, completion_tokens: 2 } }), (...a) => calls.push(a));
		const out = await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8-fast" as never, { messages: [] } as never);
		expect(out).toMatchObject({ response: "NO" });
		expect(calls).toEqual([["@cf/meta/llama-3.1-8b-instruct-fp8-fast", 120, 2]]);
	});

	it("records usage from the final event of a stream and passes the stream through", async () => {
		const sse = 'data: {"response":"Hi"}\n\ndata: {"response":"","usage":{"prompt_tokens":900,"completion_tokens":45,"total_tokens":945}}\n\ndata: [DONE]\n\n';
		const stream = new Response(sse).body!;
		const calls: Array<[string, number, number]> = [];
		const ai = meterAi(fakeAi(stream), (...a) => calls.push(a));
		const out = (await ai.run("@cf/zai-org/glm-4.7-flash" as never, { messages: [], stream: true } as never)) as ReadableStream;
		expect(await new Response(out).text()).toBe(sse);
		expect(calls).toEqual([["@cf/zai-org/glm-4.7-flash", 900, 45]]);
	});

	it("estimates when the response has no usage", async () => {
		const calls: Array<[string, number, number]> = [];
		const ai = meterAi(fakeAi({ response: "abcdefgh" }), (...a) => calls.push(a));
		await ai.run("x" as never, { messages: [{ role: "user", content: "a".repeat(400) }] } as never);
		expect(calls[0][1]).toBeGreaterThan(90);
		expect(calls[0][2]).toBeGreaterThan(0);
	});

	it("prices calls per model", () => {
		expect(neuronsFor("@cf/zai-org/glm-4.7-flash", 5000, 500)).toBeCloseTo(27.5 + 18.2, 5);
	});

	it("sums today's usage in the mailbox and reports it in stats", async () => {
		await createMailbox();
		const stub = mailboxStub();
		await stub.recordAiUsage("@cf/zai-org/glm-4.7-flash", 5000, 500);
		await stub.recordAiUsage("@cf/zai-org/glm-4.7-flash", 5000, 500);
		await stub.recordAiUsage("@cf/meta/llama-3.1-8b-instruct-fp8-fast", 1000, 2);
		const { ai } = (await (await api(`${base}/stats`)).json()) as { ai: { neurons: number; limit: number; models: Array<{ model: string; calls: number }> } };
		expect(ai.limit).toBe(10_000);
		expect(ai.models[0]).toMatchObject({ model: "@cf/zai-org/glm-4.7-flash", calls: 2 });
		expect(ai.neurons).toBeCloseTo(2 * 45.7 + neuronsFor("@cf/meta/llama-3.1-8b-instruct-fp8-fast", 1000, 2), 3);
	});

	it("accepts only known agent models in settings", async () => {
		await createMailbox();
		const put = (agent: unknown) =>
			api(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: { agent } }) });
		expect((await put({ autoDraft: true, model: "@cf/qwen/qwen3-30b-a3b-fp8" })).status).toBe(200);
		expect((await put({ autoDraft: true, model: "@cf/moonshotai/kimi-k2.5" })).status).toBe(400);
	});
});
