import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import {
  AUTHORITATIVE_STANDARD,
  freedomContract,
  priorityContract
} from "../app/api/translation-prompts.ts";
import {
  calculateCost,
  controlledResponse,
  pricingFor
} from "../app/api/openai-control.ts";

const MODEL = "gpt-5.6-sol";
const REASONING = { effort: "low" as const };
const INPUT_TOKEN_CEILING = 6_000;
const OUTPUT_TOKEN_LIMIT = 3_500;
const TIMEOUT_MS = 90_000;
const COST_LIMIT_USD = 0.135;
const CONFIRMATION = "RUN_ONE_GENERATION_ONLY_REVIEW";
const sources = [
  "A friend is oh-so-special and it's good to let them know. I really love you all so MUSH, and now I've told you so!",
  "These friends can help the party start. They shine a magic light. I really love you oh-so-MUSH! You glow all through the night.",
  "My giant friend is brave and strong—a shelter in the storm. I really love you oh-so-MUSH because you keep me warm."
];

const prompt = `${AUTHORITATIVE_STANDARD}

CONTROLLED GENERATION-ONLY REVIEW
This is one generation call for manual native-speaker review. There is no automated evaluator and no retry.

CONFIRMED ENGLISH, IN SPREAD ORDER
${sources.map((source, index) => `${index + 1}. ${source}`).join("\n")}

${priorityContract("rhythm")}
${freedomContract("natural")}

Privately develop exactly six genuinely different book-level adaptation candidates. Each candidate must:
- define one exact recurring Slovenian refrain or device;
- provide complete Slovenian text for all three spreads;
- preserve each spread's source event, image-grounded detail present in the confirmed text, emotional beat, and approximate density;
- use natural, grammatical, native Slovenian suitable for repeated reading aloud;
- use a coherent genuine phonetic rhyme treatment and natural spoken cadence on every spread;
- keep the mushroom narrator grammatically feminine where "goba" governs agreement;
- avoid unsupported invention, filler, forced inversion, English syntax, repeated-root pseudo-rhyme, slash forms, and placeholders;
- differ materially from the other candidates in refrain strategy, rhyme structure, cadence, or meaning/music balance.

After drafting all six, select exactly three finalists that best satisfy the authoritative standard. The finalists must be meaningfully different from one another. Return all six raw candidates for review plus the three selected ids. Do not claim that an external evaluator approved them. Do not expose chain-of-thought.`;

const candidateSchema = z.object({
  id: z.string().regex(/^c0[1-6]$/),
  strategy: z.string().min(1),
  exactRefrain: z.string().min(1),
  spreads: z.array(z.object({
    spread: z.number().int().min(1).max(3),
    text: z.string().min(1)
  })).length(3)
});
const resultSchema = z.object({
  candidates: z.array(candidateSchema).length(6),
  selectedFinalistIds: z.array(z.string().regex(/^c0[1-6]$/)).length(3)
});
const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^c0[1-6]$" },
          strategy: { type: "string" },
          exactRefrain: { type: "string" },
          spreads: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                spread: { type: "integer", minimum: 1, maximum: 3 },
                text: { type: "string" }
              },
              required: ["spread", "text"]
            }
          }
        },
        required: ["id", "strategy", "exactRefrain", "spreads"]
      }
    },
    selectedFinalistIds: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", pattern: "^c0[1-6]$" }
    }
  },
  required: ["candidates", "selectedFinalistIds"]
} as const;

const maximumCostUsd = calculateCost(
  {
    inputTokens: INPUT_TOKEN_CEILING,
    cachedInputTokens: 0,
    outputTokens: OUTPUT_TOKEN_LIMIT
  },
  {
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30
  }
);
if (maximumCostUsd > COST_LIMIT_USD) throw new Error("The static maximum cost calculation exceeds the harness limit.");

const description = {
  promptVersion: createHash("sha256").update(prompt).digest("hex"),
  purpose: [
    "Does the authoritative prompt produce natural Slovenian?",
    "Does the rhyme-selected direction genuinely rhyme?",
    "Are the selected finalists meaningfully different?",
    "What are the latency, token usage, and estimated cost of one call?"
  ],
  imagesSent: false,
  sourceTexts: sources,
  model: MODEL,
  reasoning: REASONING,
  attempts: 1,
  evaluatorCalls: 0,
  automaticRetries: 0,
  internalCandidateCount: 6,
  returnedFinalistCount: 3,
  inputTokenCeiling: INPUT_TOKEN_CEILING,
  maxOutputTokens: OUTPUT_TOKEN_LIMIT,
  timeoutMs: TIMEOUT_MS,
  maximumCostUsd,
  prompt,
  responseSchema,
  confirmationRequired: CONFIRMATION
};

if (!process.argv.includes("--confirm-live")) {
  console.log(JSON.stringify(description, null, 2));
  process.exit(0);
}
const confirmationIndex = process.argv.indexOf("--confirm-live");
if (process.argv[confirmationIndex + 1] !== CONFIRMATION) {
  throw new Error(`Refusing live generation. Pass --confirm-live ${CONFIRMATION} only after immediate user confirmation.`);
}

const officialPricing = pricingFor(MODEL);
const configuredMaximum = calculateCost(
  { inputTokens: INPUT_TOKEN_CEILING, cachedInputTokens: 0, outputTokens: OUTPUT_TOKEN_LIMIT },
  officialPricing
);
if (configuredMaximum > COST_LIMIT_USD) {
  throw new Error(`Configured maximum $${configuredMaximum.toFixed(6)} exceeds $${COST_LIMIT_USD.toFixed(6)}.`);
}
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required.");

const client = new OpenAI({ apiKey, maxRetries: 0 });
const disconnectController = new AbortController();
const cancel = () => disconnectController.abort(new Error("Client disconnected"));
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const stamp = new Date().toISOString().replaceAll(":", "-");
const artifactDirectory = `artifacts/live-evals/${stamp}-generation-only`;
await mkdir(artifactDirectory, { recursive: true });
await writeFile(`${artifactDirectory}/request.json`, JSON.stringify(description, null, 2));
await writeFile(`${artifactDirectory}/prompt.txt`, prompt);

try {
  const { response, usage } = await controlledResponse({
    client,
    requestSignal: disconnectController.signal,
    action: "live-review.generate-only",
    model: MODEL,
    maxOutputTokens: OUTPUT_TOKEN_LIMIT,
    timeoutMs: TIMEOUT_MS,
    body: {
      model: MODEL,
      reasoning: REASONING,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      text: {
        format: {
          type: "json_schema",
          name: "generation_only_review",
          strict: true,
          schema: responseSchema
        }
      }
    }
  });
  const parsed = resultSchema.parse(JSON.parse(response.output_text));
  const selected = new Set(parsed.selectedFinalistIds);
  if (selected.size !== 3) throw new Error("The model did not select three distinct finalists.");
  const finalists = parsed.candidates.filter((candidate) => selected.has(candidate.id));
  if (finalists.length !== 3) throw new Error("A selected finalist id did not match a raw candidate.");
  await writeFile(
    `${artifactDirectory}/response.json`,
    JSON.stringify({ usage, rawResponse: response, rawCandidates: parsed.candidates, finalists }, null, 2)
  );
  console.log(JSON.stringify({ artifactDirectory, usage, finalists }, null, 2));
} finally {
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
}
