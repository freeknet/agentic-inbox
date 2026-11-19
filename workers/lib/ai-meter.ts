/**
 * Neuron meter (plan §A1): wraps the AI binding so every call, from the
 * agent (via the AI SDK), the injection scan and the draft verifier, records
 * its token usage in the mailbox's Durable Object. Streams are measured from
 * the usage object in their final server-sent event.
 */
import type { Env } from "../types";

export interface UsageRecorder {
	(model: string, inputTokens: number, outputTokens: number): void;
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };

/** Rough token count when a response carries no usage: ~4 characters per token. */
function estimateTokens(value: unknown): number {
	try {
		return Math.ceil(JSON.stringify(value ?? "").length / 4);
	} catch {
		return 0;
	}
}

const USAGE_RE = /"prompt_tokens"\s*:\s*(\d+)[\s\S]*?"completion_tokens"\s*:\s*(\d+)/;

/** Pass a stream through unchanged and report the last usage object seen in it. */
function meterStream(stream: ReadableStream<Uint8Array>, onDone: (usage: Usage | null) => void): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	let tail = "";
	let usage: Usage | null = null;
	return stream.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				controller.enqueue(chunk);
				tail = (tail + decoder.decode(chunk, { stream: true })).slice(-4096);
				const m = tail.match(USAGE_RE);
				if (m) usage = { prompt_tokens: Number(m[1]), completion_tokens: Number(m[2]) };
			},
			flush() {
				onDone(usage);
			},
		}),
	);
}

export function meterAi(ai: Ai, record: UsageRecorder): Ai {
	const run = async (model: string, input: unknown, options?: unknown) => {
		const result = await (ai.run as (m: string, i: unknown, o?: unknown) => Promise<unknown>)(model, input, options);
		const fallbackIn = estimateTokens((input as { messages?: unknown; prompt?: unknown })?.messages ?? (input as { prompt?: unknown })?.prompt);
		if (result instanceof ReadableStream) {
			return meterStream(result as ReadableStream<Uint8Array>, (u) =>
				record(model, u?.prompt_tokens ?? fallbackIn, u?.completion_tokens ?? 0),
			);
		}
		const r = result as { usage?: Usage; response?: unknown } | null;
		record(model, r?.usage?.prompt_tokens ?? fallbackIn, r?.usage?.completion_tokens ?? estimateTokens(r?.response));
		return result;
	};
	return new Proxy(ai, {
		get(target, prop, receiver) {
			if (prop === "run") return run;
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** The AI binding for a mailbox, metered into that mailbox's Durable Object. */
export function mailboxAi(env: Env, mailboxId: string): Ai {
	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
	return meterAi(env.AI, (model, input, output) => {
		stub.recordAiUsage(model, input, output).catch((e: Error) => console.error("AI meter write failed:", e.message));
	});
}
