import { createHash } from "node:crypto";
import type OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming
} from "openai/resources/responses/responses";

export const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 25_000);
export const MAX_ACTION_COST_USD = Number(process.env.OPENAI_MAX_ACTION_COST_USD || 0.50);

export type ModelPricing = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type UsageRecord = {
  action: string;
  model: string;
  reasoningEffort: "low";
  responseId?: string;
  responseStatus?: string;
  incompleteReason?: string;
  latencyMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
};

const inFlight = new Map<string, Promise<unknown>>();

function configuredRate(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function pricingFor(model: string): ModelPricing {
  const family = model === "gpt-4.1-mini"
    ? "GPT_4_1_MINI"
    : model.includes("terra") ? "TERRA" : "SOL";
  const defaults = family === "GPT_4_1_MINI"
    ? { input: 0.40, cached: 0.10, output: 1.60 }
    : family === "TERRA"
      ? { input: 2.50, cached: 0.25, output: 15 }
      : { input: 5, cached: 0.50, output: 30 };
  return {
    inputUsdPerMillion: configuredRate(`OPENAI_${family}_INPUT_USD_PER_1M`, defaults.input),
    cachedInputUsdPerMillion: configuredRate(`OPENAI_${family}_CACHED_INPUT_USD_PER_1M`, defaults.cached),
    outputUsdPerMillion: configuredRate(`OPENAI_${family}_OUTPUT_USD_PER_1M`, defaults.output)
  };
}

export function calculateCost(
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  pricing: ModelPricing
) {
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    uncached * pricing.inputUsdPerMillion +
    usage.cachedInputTokens * pricing.cachedInputUsdPerMillion +
    usage.outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;
}

export function assertActionBudget(args: {
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  callCount: number;
}) {
  const pricing = pricingFor(args.model);
  const estimatedMaximum =
    args.callCount *
    calculateCost(
      { inputTokens: args.maxInputTokens, cachedInputTokens: 0, outputTokens: args.maxOutputTokens },
      pricing
    );
  if (estimatedMaximum > MAX_ACTION_COST_USD) {
    throw new Error(
      `Estimated maximum action cost $${estimatedMaximum.toFixed(4)} exceeds the configured $${MAX_ACTION_COST_USD.toFixed(4)} limit.`
    );
  }
  return estimatedMaximum;
}

export function requestKey(scope: string, value: unknown) {
  return `${scope}:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export async function deduplicate<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = task().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

export async function controlledResponse(args: {
  client: OpenAI;
  requestSignal: AbortSignal;
  action: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs?: number;
  body: ResponseCreateParamsNonStreaming;
}) {
  if (args.requestSignal.aborted) throw new DOMException("Client disconnected", "AbortError");
  const controller = new AbortController();
  const cancel = () => controller.abort(args.requestSignal.reason);
  args.requestSignal.addEventListener("abort", cancel, { once: true });
  const timeoutMs = args.timeoutMs ?? OPENAI_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(new Error(`OpenAI request exceeded ${timeoutMs}ms`)), timeoutMs);
  const started = Date.now();

  try {
    const response = await args.client.responses.create(
      { ...args.body, max_output_tokens: args.maxOutputTokens },
      { signal: controller.signal, maxRetries: 0 }
    ) as Response;
    const usage = response.usage;
    const inputTokens = usage?.input_tokens || 0;
    const cachedInputTokens = usage?.input_tokens_details?.cached_tokens || 0;
    const outputTokens = usage?.output_tokens || 0;
    const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens || 0;
    const record: UsageRecord = {
      action: args.action,
      model: args.model,
      reasoningEffort: "low",
      responseId: response.id,
      responseStatus: response.status,
      incompleteReason: response.incomplete_details?.reason,
      latencyMs: Date.now() - started,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningTokens,
      estimatedCostUsd: calculateCost(
        { inputTokens, cachedInputTokens, outputTokens },
        pricingFor(args.model)
      )
    };
    console.info("openai_usage", JSON.stringify(record));
    return { response, usage: record };
  } finally {
    clearTimeout(timeout);
    args.requestSignal.removeEventListener("abort", cancel);
  }
}
