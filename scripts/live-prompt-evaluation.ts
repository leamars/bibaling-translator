import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import {
  directionsEvaluationPrompt,
  directionsGenerationPrompt
} from "../app/api/translation-prompts.ts";
import {
  calculateCost,
  controlledResponse,
  MAX_ACTION_COST_USD,
  OPENAI_TIMEOUT_MS,
  pricingFor
} from "../app/api/openai-control.ts";
import { deterministicViolations } from "../app/api/translation-quality.ts";

const MODEL = "gpt-5.6-sol";
const REASONING = { effort: "low" as const };
const GENERATION_OUTPUT_LIMIT = 3_500;
const EVALUATION_OUTPUT_LIMIT = 2_500;
const MAX_INPUT_TOKENS_PER_CALL = 6_000;
const CONFIRMATION = "RUN_ONE_BIBALING_LIVE_EVAL";
const sources = [
  "A friend is oh-so-special and it's good to let them know. I really love you all so MUSH, and now I've told you so!",
  "These friends can help the party start. They shine a magic light. I really love you oh-so-MUSH! You glow all through the night.",
  "My giant friend is brave and strong—a shelter in the storm. I really love you oh-so-MUSH because you keep me warm."
];
const generationPrompt = directionsGenerationPrompt({
  texts: sources,
  priority: "rhythm",
  freedom: "natural"
});
const evaluationPromptTemplate = directionsEvaluationPrompt({
  texts: sources,
  priority: "rhythm",
  freedom: "natural",
  directionsJson: "__DETERMINISTIC_SURVIVORS_FROM_CALL_1__"
});

const directionObject = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    refrain: { type: "string" },
    approach: { type: "string" },
    keeps: { type: "string" },
    changes: { type: "string" },
    genderDependency: { type: "string" }
  },
  required: ["name", "refrain", "approach", "keeps", "changes", "genderDependency"]
} as const;
const generationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    directions: { type: "array", minItems: 6, maxItems: 6, items: directionObject }
  },
  required: ["directions"]
} as const;
const candidateSchema = z.object({
  name: z.string(),
  refrain: z.string(),
  approach: z.string(),
  keeps: z.string(),
  changes: z.string(),
  genderDependency: z.string()
});

function evaluationSchema(count: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      evaluations: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            directionIndex: { type: "integer", minimum: 0, maximum: 5 },
            baselinePass: { type: "boolean" },
            directionPass: { type: "boolean" },
            rhymePass: { type: "boolean" },
            pass: { type: "boolean" },
            reasons: { type: "array", items: { type: "string" } }
          },
          required: ["directionIndex", "baselinePass", "directionPass", "rhymePass", "pass", "reasons"]
        }
      }
    },
    required: ["evaluations"]
  } as const;
}

function maximumEstimatedCost() {
  const pricing = pricingFor(MODEL);
  return calculateCost(
    {
      inputTokens: MAX_INPUT_TOKENS_PER_CALL * 2,
      cachedInputTokens: 0,
      outputTokens: GENERATION_OUTPUT_LIMIT + EVALUATION_OUTPUT_LIMIT
    },
    pricing
  );
}

const description = {
  promptVersion: createHash("sha256")
    .update(generationPrompt)
    .update(evaluationPromptTemplate)
    .digest("hex"),
  fixture: "mushroom-book-three-spread-v1",
  imagesSent: false,
  model: MODEL,
  reasoning: REASONING,
  attempts: 1,
  automaticRetries: 0,
  candidateCount: 6,
  calls: [
    {
      action: "directions.generate",
      maxOutputTokens: GENERATION_OUTPUT_LIMIT,
      input: [{ role: "user", content: [{ type: "input_text", text: generationPrompt }] }],
      responseSchema: generationSchema
    },
    {
      action: "directions.evaluate",
      maxOutputTokens: EVALUATION_OUTPUT_LIMIT,
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: evaluationPromptTemplate
        }]
      }],
      dynamicReplacement: "__DETERMINISTIC_SURVIVORS_FROM_CALL_1__ is replaced with only deterministic survivors from call 1.",
      responseSchema: "Sized at runtime to the survivor count."
    }
  ],
  hardTimeoutMsPerCall: OPENAI_TIMEOUT_MS,
  maximumConfiguredActionCostUsd: MAX_ACTION_COST_USD,
  confirmationRequired: CONFIRMATION
};

if (!process.argv.includes("--confirm-live")) {
  console.log(JSON.stringify(description, null, 2));
  process.exit(0);
}
const confirmationIndex = process.argv.indexOf("--confirm-live");
if (process.argv[confirmationIndex + 1] !== CONFIRMATION) {
  throw new Error(`Refusing live evaluation. Pass --confirm-live ${CONFIRMATION} only after explicit user permission.`);
}

const estimatedMaximum = maximumEstimatedCost();
if (estimatedMaximum > MAX_ACTION_COST_USD) {
  throw new Error(
    `Refusing live evaluation: estimated maximum $${estimatedMaximum.toFixed(4)} exceeds $${MAX_ACTION_COST_USD.toFixed(4)}.`
  );
}
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required.");

const client = new OpenAI({ apiKey, maxRetries: 0 });
const signal = new AbortController().signal;
const stamp = new Date().toISOString().replaceAll(":", "-");
const artifactDirectory = `artifacts/live-evals/${stamp}`;
await mkdir(artifactDirectory, { recursive: true });
await writeFile(`${artifactDirectory}/request.json`, JSON.stringify({ ...description, estimatedMaximum }, null, 2));

const { response: generated, usage: generationUsage } = await controlledResponse({
  client,
  requestSignal: signal,
  action: "live-eval.directions.generate",
  model: MODEL,
  maxOutputTokens: GENERATION_OUTPUT_LIMIT,
  body: {
    model: MODEL,
    reasoning: REASONING,
    input: [{ role: "user", content: [{ type: "input_text", text: generationPrompt }] }],
    text: { format: { type: "json_schema", name: "literary_directions", strict: true, schema: generationSchema } }
  }
});
const rawCandidates = z.object({ directions: z.array(candidateSchema).length(6) }).parse(JSON.parse(generated.output_text));
await writeFile(
  `${artifactDirectory}/generation.json`,
  JSON.stringify({ usage: generationUsage, rawResponse: generated, rawCandidates }, null, 2)
);

const survivors = rawCandidates.directions
  .map((direction, directionIndex) => ({ direction, directionIndex }))
  .filter(({ direction }) =>
    deterministicViolations(direction.refrain, { requireCompleteSentence: false }).length === 0
  );
if (survivors.length < 3) throw new Error(`Only ${survivors.length} candidates survived deterministic checks.`);
const evaluationPrompt = directionsEvaluationPrompt({
  texts: sources,
  priority: "rhythm",
  freedom: "natural",
  directionsJson: JSON.stringify(survivors)
});
await writeFile(`${artifactDirectory}/evaluation-prompt.txt`, evaluationPrompt);

const { response: evaluated, usage: evaluationUsage } = await controlledResponse({
  client,
  requestSignal: signal,
  action: "live-eval.directions.evaluate",
  model: MODEL,
  maxOutputTokens: EVALUATION_OUTPUT_LIMIT,
  body: {
    model: MODEL,
    reasoning: REASONING,
    input: [{ role: "user", content: [{ type: "input_text", text: evaluationPrompt }] }],
    text: {
      format: {
        type: "json_schema",
        name: "direction_evaluation",
        strict: true,
        schema: evaluationSchema(survivors.length)
      }
    }
  }
});
await writeFile(
  `${artifactDirectory}/evaluation.json`,
  JSON.stringify({ usage: evaluationUsage, rawResponse: evaluated, survivors }, null, 2)
);
console.log(JSON.stringify({ artifactDirectory, generationUsage, evaluationUsage }, null, 2));
