import { NextResponse } from "next/server";
import { z } from "zod";
import { COMPARISON_MODELS, generationError, openAIClient } from "../generation";
import { mockOptions } from "../mock-fixtures";
import {
  assertActionBudget,
  controlledResponse,
  deduplicate,
  requestKey
} from "../openai-control";
import {
  translationEvaluationPrompt,
  translationGenerationPrompt,
  type DirectionBrief,
  type Freedom,
  type Priority
} from "../translation-prompts";
import {
  deterministicViolations,
  evaluationPasses,
  type CandidateEvaluation
} from "../translation-quality";

export const runtime = "nodejs";

const directionSchema = z.object({
  name: z.string().min(1),
  refrain: z.string().min(1),
  approach: z.string().min(1),
  keeps: z.string().min(1),
  changes: z.string().min(1),
  genderDependency: z.string().min(1)
});

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("spread1"),
    image: z.string().startsWith("data:image/"),
    source: z.string().min(1),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    direction: directionSchema
  }),
  z.object({
    mode: z.literal("pattern"),
    images: z.array(z.string().startsWith("data:image/")).length(2),
    sources: z.array(z.string().min(1)).length(2),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    direction: directionSchema,
    approvedSpread1: z.string().min(1),
    approvedSpread1Note: z.string().max(1200).optional()
  })
]);

const candidateSchema = z.object({
  id: z.string().min(1),
  strategy: z.string().min(1),
  text: z.string().min(1)
});
const CANDIDATE_COUNT = 6;
const candidatePoolSchema = z.object({ candidates: z.array(candidateSchema).length(CANDIDATE_COUNT) });
const evaluationItemSchema = z.object({
    candidateId: z.string().min(1),
    fidelityPass: z.boolean(),
    grammarPass: z.boolean(),
    readAloudPass: z.boolean(),
    directionPass: z.boolean(),
    rhymePass: z.boolean(),
    pass: z.boolean(),
    reasons: z.array(z.string())
});

const candidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: CANDIDATE_COUNT,
      maxItems: CANDIDATE_COUNT,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^c0[1-6]$" },
          strategy: { type: "string" },
          text: { type: "string" }
        },
        required: ["id", "strategy", "text"]
      }
    }
  },
  required: ["candidates"]
} as const;

function evaluationJsonSchema(candidateCount: number) {
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    evaluations: {
      type: "array",
      minItems: candidateCount,
      maxItems: candidateCount,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateId: { type: "string" },
          fidelityPass: { type: "boolean" },
          grammarPass: { type: "boolean" },
          readAloudPass: { type: "boolean" },
          directionPass: { type: "boolean" },
          rhymePass: { type: "boolean" },
          pass: { type: "boolean" },
          reasons: { type: "array", items: { type: "string" } }
        },
        required: [
          "candidateId",
          "fidelityPass",
          "grammarPass",
          "readAloudPass",
          "directionPass",
          "rhymePass",
          "pass",
          "reasons"
        ]
      }
    }
  },
  required: ["evaluations"]
  } as const;
}

type PipelineArgs = {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  model: string;
  image: string;
  spreadNumber: number;
  source: string;
  priority: Priority;
  freedom: Freedom;
  direction: DirectionBrief;
  approvedSpread1?: string;
  approvedSpread1Note?: string;
  requestSignal: AbortSignal;
};

async function generatePassingOptions(args: PipelineArgs) {
  const { response: generationResponse } = await controlledResponse({
    client: args.client,
    requestSignal: args.requestSignal,
    action: `spread${args.spreadNumber}.generate`,
    model: args.model,
    maxOutputTokens: 3_500,
    timeoutMs: 90_000,
    body: {
      model: args.model,
      reasoning: { effort: "low" },
      input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: translationGenerationPrompt({
                spreadNumber: args.spreadNumber,
                source: args.source,
                priority: args.priority,
                freedom: args.freedom,
                direction: args.direction,
                approvedSpread1: args.approvedSpread1,
                approvedSpread1Note: args.approvedSpread1Note
              })
            },
            { type: "input_image", image_url: args.image, detail: "high" }
          ]
        }],
        text: { format: { type: "json_schema", name: "private_translation_candidates", strict: true, schema: candidateJsonSchema } }
      }
    });
    const pool = candidatePoolSchema.parse(JSON.parse(generationResponse.output_text));
    const survivors = pool.candidates.filter((candidate) =>
      deterministicViolations(candidate.text).length === 0
    );
    if (survivors.length < 3) {
      throw new Error(`Only ${survivors.length} translations survived deterministic quality checks.`);
    }

    const { response: evaluationResponse } = await controlledResponse({
      client: args.client,
      requestSignal: args.requestSignal,
      action: `spread${args.spreadNumber}.evaluate`,
      model: "gpt-5.6-sol",
      maxOutputTokens: 2_500,
      timeoutMs: 90_000,
      body: {
        model: "gpt-5.6-sol",
        reasoning: { effort: "low" },
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: translationEvaluationPrompt({
                spreadNumber: args.spreadNumber,
                source: args.source,
                priority: args.priority,
                freedom: args.freedom,
                direction: args.direction,
                approvedSpread1: args.approvedSpread1,
                approvedSpread1Note: args.approvedSpread1Note,
                candidatesJson: JSON.stringify(survivors)
              })
            },
            { type: "input_image", image_url: args.image, detail: "high" }
          ]
        }],
        text: { format: { type: "json_schema", name: "translation_quality_evaluation", strict: true, schema: evaluationJsonSchema(survivors.length) } }
      }
    });
    const evaluated = z.object({
      evaluations: z.array(evaluationItemSchema).length(survivors.length)
    }).parse(JSON.parse(evaluationResponse.output_text));
    const evaluations = new Map(evaluated.evaluations.map((item) => [item.candidateId, item]));
    const passing: Array<{ strategy: string; text: string }> = [];

    for (const candidate of survivors) {
      const evaluation = evaluations.get(candidate.id) as CandidateEvaluation | undefined;
      if (evaluation && evaluationPasses(candidate.text, args.priority, evaluation)) {
        const duplicate = passing.some((option) => option.text.trim() === candidate.text.trim());
        if (!duplicate && passing.length < 3) passing.push({ strategy: candidate.strategy, text: candidate.text });
      }
    }

  if (passing.length !== 3) {
    throw new Error(`Only ${passing.length} translations passed the authoritative quality gate`);
  }
  return passing;
}

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    if (process.env.BIBALING_MOCK_MODE === "true") {
      const spreads = input.mode === "spread1"
        ? undefined
        : [2, 3].map((spread) => ({ spread, options: mockOptions(spread) }));
      return NextResponse.json({
        runs: [{
          model: "mock",
          label: "Mock fixture",
          ...(input.mode === "spread1" ? { options: mockOptions(1) } : { spreads })
        }],
        rejectedRuns: [],
        mock: true
      });
    }
    const client = openAIClient();
    if (!client) return NextResponse.json({ error: "Translation generation isn’t connected. Add a valid OPENAI_API_KEY and restart." }, { status: 503 });
    for (const { model } of COMPARISON_MODELS) {
      assertActionBudget({
        model,
        maxInputTokens: 4_000,
        maxOutputTokens: 3_500,
        callCount: input.mode === "spread1" ? 2 : 4
      });
    }

    if (input.mode === "spread1") {
      const settled = await deduplicate(requestKey("spread1", input), () =>
        Promise.allSettled(COMPARISON_MODELS.map(async ({ model, label }) => ({
        model,
        label,
        options: await generatePassingOptions({
          client,
          model,
          image: input.image,
          spreadNumber: 1,
          source: input.source,
          priority: input.priority,
          freedom: input.freedom,
          direction: input.direction,
          requestSignal: request.signal
        })
      }))));
      const runs = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const rejectedRuns = settled.flatMap((result, index) =>
        result.status === "rejected"
          ? [{ model: COMPARISON_MODELS[index].model, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }]
          : []
      );
      if (rejectedRuns.length > 0) console.warn("Spread 1 comparison runs rejected", rejectedRuns);
      if (runs.length === 0) throw new Error(rejectedRuns.map((run) => `${run.model}: ${run.error}`).join("\n"));
      return NextResponse.json({ runs, rejectedRuns });
    }

    const settled = await deduplicate(requestKey("pattern", input), () =>
      Promise.allSettled(COMPARISON_MODELS.map(async ({ model, label }) => {
      const spreads = await Promise.all([2, 3].map(async (spreadNumber, index) => ({
        spread: spreadNumber,
        options: await generatePassingOptions({
          client,
          model,
          image: input.images[index],
          spreadNumber,
          source: input.sources[index],
          priority: input.priority,
          freedom: input.freedom,
          direction: input.direction,
          approvedSpread1: input.approvedSpread1,
          approvedSpread1Note: input.approvedSpread1Note,
          requestSignal: request.signal
        })
      })));
      return { model, label, spreads };
    })));
    const runs = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const rejectedRuns = settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ model: COMPARISON_MODELS[index].model, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }]
        : []
    );
    if (rejectedRuns.length > 0) console.warn("Pattern comparison runs rejected", rejectedRuns);
    if (runs.length === 0) throw new Error(rejectedRuns.map((run) => `${run.model}: ${run.error}`).join("\n"));
    return NextResponse.json({ runs, rejectedRuns });
  } catch (error) {
    return generationError(error);
  }
}
