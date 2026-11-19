/**
 * Workers AI models this app uses, with their Neuron prices (per million
 * tokens) from https://developers.cloudflare.com/workers-ai/platform/pricing/
 * (checked 2026-11-19). Workers Free includes 10,000 Neurons per day,
 * account-wide, reset at 00:00 UTC.
 */

export const FREE_NEURONS_PER_DAY = 10_000;
/** Auto-draft stops for the day once the estimate passes this share of the free allocation. */
export const AUTO_DRAFT_BUDGET_SHARE = 0.9;

export const DEFAULT_AGENT_MODEL = "@cf/zai-org/glm-4.7-flash";
/** Prompt-injection scan on every auto-drafted email (cheap, short output). */
export const INJECTION_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
/** Cleans agent artifacts out of drafts before they are saved or sent. */
export const VERIFIER_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

export const NEURON_PRICES: Record<string, { input: number; output: number }> = {
	"@cf/zai-org/glm-4.7-flash": { input: 5500, output: 36400 },
	"@cf/qwen/qwen3-30b-a3b-fp8": { input: 4625, output: 30475 },
	"@cf/google/gemma-4-26b-a4b-it": { input: 9091, output: 27273 },
	"@cf/ibm-granite/granite-4.0-h-micro": { input: 1542, output: 10158 },
	"@cf/meta/llama-3.1-8b-instruct-fp8-fast": { input: 4119, output: 34868 },
	"@cf/meta/llama-4-scout-17b-16e-instruct": { input: 24545, output: 77273 },
};

/** Models offered in Settings for the agent (all support tool calling). */
export const AGENT_MODELS: Array<{ id: string; label: string }> = [
	{ id: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash (default)" },
	{ id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B A3B" },
	{ id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B" },
	{ id: "@cf/ibm-granite/granite-4.0-h-micro", label: "Granite 4.0 Micro (cheapest)" },
];

export function isAgentModel(id: unknown): id is string {
	return typeof id === "string" && AGENT_MODELS.some((m) => m.id === id);
}

/** Neurons for one call. Unknown models are priced like the most expensive known one. */
export function neuronsFor(model: string, inputTokens: number, outputTokens: number): number {
	const price = NEURON_PRICES[model] ?? { input: 24545, output: 77273 };
	return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
