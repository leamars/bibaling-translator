import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import {
  calculateCost,
  controlledResponse,
  pricingFor
} from "../app/api/openai-control.ts";
import {
  declaredRhymeViolations,
  deterministicViolations,
  structuralDiversityViolations
} from "../app/api/translation-quality.ts";

const MODEL = "gpt-5.6-sol";
const INPUT_TOKEN_CEILING = 6_000;
const OUTPUT_TOKEN_LIMIT = 3_500;
const TIMEOUT_MS = 90_000;
const COST_LIMIT_USD = 0.135;
const CONFIRMATION = "RUN_ONE_GENERATION_ONLY_REVIEW_V2";
const structureIds = [
  "aabb_integrated_refrain",
  "abab_interleaved",
  "story_couplets_button",
  "call_and_response",
  "variable_density",
  "compact_two_beat"
] as const;
const prompt = await readFile(
  new URL("../docs/translation/prompt_revision_2_generation_only.txt", import.meta.url),
  "utf8"
);

const rhymePairSchema = z.object({
  firstLine: z.number().int().min(1),
  secondLine: z.number().int().min(1)
});
const candidateSchema = z.object({
  id: z.string().regex(/^c0[1-6]$/),
  structureId: z.enum(structureIds),
  strategyNote: z.string().min(1),
  exactRefrain: z.string().min(1),
  spreads: z.array(z.object({
    spread: z.number().int().min(1).max(3),
    bookText: z.string().min(1),
    rhymePairs: z.array(rhymePairSchema).min(1)
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
          structureId: { type: "string", enum: [...structureIds] },
          strategyNote: { type: "string" },
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
                bookText: { type: "string" },
                rhymePairs: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      firstLine: { type: "integer", minimum: 1 },
                      secondLine: { type: "integer", minimum: 1 }
                    },
                    required: ["firstLine", "secondLine"]
                  }
                }
              },
              required: ["spread", "bookText", "rhymePairs"]
            }
          }
        },
        required: ["id", "structureId", "strategyNote", "exactRefrain", "spreads"]
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
  { inputTokens: INPUT_TOKEN_CEILING, cachedInputTokens: 0, outputTokens: OUTPUT_TOKEN_LIMIT },
  { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 }
);
const description = {
  promptVersion: createHash("sha256").update(prompt).digest("hex"),
  model: MODEL,
  reasoning: { effort: "low" as const },
  calls: 1,
  evaluators: 0,
  retries: 0,
  candidateCount: 6,
  finalistCount: 3,
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
const configuredMaximum = calculateCost(
  { inputTokens: INPUT_TOKEN_CEILING, cachedInputTokens: 0, outputTokens: OUTPUT_TOKEN_LIMIT },
  pricingFor(MODEL)
);
if (configuredMaximum > COST_LIMIT_USD) throw new Error("Configured pricing exceeds the approved cost ceiling.");
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required.");

const disconnectController = new AbortController();
const cancel = () => disconnectController.abort(new Error("Client disconnected"));
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const artifactDirectory = `artifacts/live-evals/${new Date().toISOString().replaceAll(":", "-")}-generation-only-v2`;
await mkdir(artifactDirectory, { recursive: true });
await writeFile(`${artifactDirectory}/request.json`, JSON.stringify(description, null, 2));
await writeFile(`${artifactDirectory}/prompt.txt`, prompt);

try {
  const { response, usage } = await controlledResponse({
    client: new OpenAI({ apiKey, maxRetries: 0 }),
    requestSignal: disconnectController.signal,
    action: "live-review.generate-only-v2",
    model: MODEL,
    maxOutputTokens: OUTPUT_TOKEN_LIMIT,
    timeoutMs: TIMEOUT_MS,
    body: {
      model: MODEL,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      text: { format: { type: "json_schema", name: "generation_only_review_v2", strict: true, schema: responseSchema } }
    }
  });
  const parsed = resultSchema.parse(JSON.parse(response.output_text));
  const violations = new Map<string, string[]>();
  for (const candidate of parsed.candidates) {
    const issues = [
      ...deterministicViolations(candidate.exactRefrain, { requireCompleteSentence: false }),
      ...candidate.spreads.flatMap((spread) => [
        ...deterministicViolations(spread.bookText),
        ...declaredRhymeViolations(spread.bookText, spread.rhymePairs)
      ])
    ];
    if (issues.length > 0) violations.set(candidate.id, issues);
  }
  const diversityIssues = structuralDiversityViolations(
    parsed.candidates.map((candidate) => candidate.structureId),
    parsed.selectedFinalistIds
  );
  const finalists = parsed.candidates.filter((candidate) =>
    parsed.selectedFinalistIds.includes(candidate.id) && !violations.has(candidate.id)
  );
  await writeFile(
    `${artifactDirectory}/response.json`,
    JSON.stringify({ usage, rawResponse: response, rawCandidates: parsed.candidates, selectedIds: parsed.selectedFinalistIds, violations: Object.fromEntries(violations), diversityIssues, finalists }, null, 2)
  );
  if (new Set(parsed.selectedFinalistIds).size !== 3 || finalists.length !== 3 || diversityIssues.length > 0) {
    throw new Error("Revision 2 did not return three deterministically eligible, structurally distinct finalists.");
  }
  console.log(JSON.stringify({ artifactDirectory, usage, finalists }, null, 2));
} finally {
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
}
