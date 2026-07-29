import { z } from "zod";
import { COMPARISON_MODELS, isMockRequest, openAIClient } from "../generation";
import { MOCK_DIRECTIONS } from "../mock-fixtures";
import {
  assertActionBudget,
  controlledResponse,
  deduplicate,
  requestKey
} from "../openai-control";
import {
  directionsEvaluationPrompt,
  directionsGenerationPrompt,
  type Freedom,
  type Priority
} from "../translation-prompts";
import { deterministicViolations } from "../translation-quality";

export const runtime = "nodejs";

const bodySchema = z.object({
  visualContexts: z.array(z.string().min(1)).length(3),
  texts: z.array(z.string().min(1)).length(3),
  priority: z.enum(["rhythm", "meaning", "simple"]),
  freedom: z.enum(["close", "natural", "playful"]),
  parentFeedback: z.string().trim().min(1).max(1000).optional(),
  previousRefrains: z.array(z.string().min(1)).max(100).default([])
});

const singleDirectionSchema = z.object({
  name: z.string().min(1),
  refrain: z.string().min(1),
  approach: z.string().min(1),
  keeps: z.string().min(1),
  changes: z.string().min(1),
  genderDependency: z.string().min(1)
});
const DIRECTION_CANDIDATE_COUNT = 6;
const directionsResultSchema = z.object({ directions: z.array(singleDirectionSchema).length(DIRECTION_CANDIDATE_COUNT) });
const directionFinalistSchema = singleDirectionSchema.extend({
    sourceDirectionIndex: z.number().int().min(0).max(DIRECTION_CANDIDATE_COUNT - 1),
    baselinePass: z.literal(true),
    directionPass: z.literal(true),
    rhymePass: z.literal(true)
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

const directionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    directions: { type: "array", minItems: DIRECTION_CANDIDATE_COUNT, maxItems: DIRECTION_CANDIDATE_COUNT, items: directionObject }
  },
  required: ["directions"]
} as const;

function editorialJsonSchema() {
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    finalists: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceDirectionIndex: { type: "integer", minimum: 0, maximum: DIRECTION_CANDIDATE_COUNT - 1 },
          ...directionObject.properties,
          baselinePass: { type: "boolean" },
          directionPass: { type: "boolean" },
          rhymePass: { type: "boolean" }
        },
        required: [
          "sourceDirectionIndex",
          ...directionObject.required,
          "baselinePass",
          "directionPass",
          "rhymePass"
        ]
      }
    }
  },
  required: ["finalists"]
  } as const;
}

async function generateAndEvaluateDirections(args: {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  model: string;
  visualContexts: string[];
  texts: string[];
  priority: Priority;
  freedom: Freedom;
  parentFeedback?: string;
  previousRefrains: string[];
  requestSignal: AbortSignal;
  progress: (event: string, detail?: Record<string, unknown>) => void;
}) {
  assertActionBudget({ model: args.model, maxInputTokens: 4_000, maxOutputTokens: 3_500, callCount: 2 });
    args.progress("generation.started");
    const generationContent: Array<{ type: "input_text"; text: string }> = [{
      type: "input_text",
      text: directionsGenerationPrompt({
        texts: args.texts,
        visualContexts: args.visualContexts,
        priority: args.priority,
        freedom: args.freedom,
        rejectionFeedback: "",
        parentFeedback: args.parentFeedback,
        previousRefrains: args.previousRefrains
      })
    }];

    const { response: generatedResponse } = await controlledResponse({
      client: args.client,
      requestSignal: args.requestSignal,
      action: "directions.generate",
      model: args.model,
      maxOutputTokens: 3_500,
      timeoutMs: 90_000,
      body: {
        model: args.model,
        reasoning: { effort: "low" },
        input: [{ role: "user", content: generationContent }],
        text: { format: { type: "json_schema", name: "literary_directions", strict: true, schema: directionsJsonSchema } }
      }
    });
    args.progress("generation.completed");
    const generated = directionsResultSchema.parse(JSON.parse(generatedResponse.output_text));
    args.progress("filtering.started");
    const survivors = generated.directions
      .map((direction, directionIndex) => ({ direction, directionIndex }))
      .filter(({ direction }) =>
        deterministicViolations(direction.refrain, { requireCompleteSentence: false }).length === 0
      );
    if (survivors.length < 3) {
      throw new Error(`Only ${survivors.length} directions survived deterministic quality checks.`);
    }
    args.progress("filtering.completed", { rejectedCount: generated.directions.length - survivors.length });

    const evaluationContent: Array<{ type: "input_text"; text: string }> = [{
      type: "input_text",
      text: directionsEvaluationPrompt({
        texts: args.texts,
        visualContexts: args.visualContexts,
        priority: args.priority,
        freedom: args.freedom,
        directionsJson: JSON.stringify(survivors)
      })
    }];

    args.progress("evaluation.started");
    const { response: evaluationResponse } = await controlledResponse({
      client: args.client,
      requestSignal: args.requestSignal,
      action: "directions.evaluate",
      model: "gpt-5.6-sol",
      maxOutputTokens: 2_500,
      timeoutMs: 90_000,
      body: {
        model: "gpt-5.6-sol",
        reasoning: { effort: "low" },
        input: [{ role: "user", content: evaluationContent }],
        text: { format: { type: "json_schema", name: "direction_editorial_finalists", strict: true, schema: editorialJsonSchema() } }
      }
    });
    args.progress("evaluation.completed");
    const editorial = z.object({
      finalists: z.array(directionFinalistSchema).length(3)
    }).parse(JSON.parse(evaluationResponse.output_text));
    const passing = editorial.finalists
      .filter((direction) => deterministicViolations(direction.refrain, { requireCompleteSentence: false }).length === 0)
      .filter((direction, index, all) =>
        all.findIndex((other) =>
          other.refrain.trim().toLocaleLowerCase("sl") === direction.refrain.trim().toLocaleLowerCase("sl")
        ) === index
      )
      .map(({ sourceDirectionIndex: _source, baselinePass: _baseline, directionPass: _direction, rhymePass: _rhyme, ...direction }) => direction);
    args.progress("rejection.completed", { rejectedCount: 3 - passing.length });
    if (passing.length !== 3) {
      throw new Error(`Only ${passing.length} editorial directions passed deterministic quality checks.`);
    }
    return { directions: passing, rejectionFeedback: "" };
}

export async function POST(request: Request) {
  const input = bodySchema.parse(await request.json());
  const encoder = new TextEncoder();
  const streamAbort = new AbortController();
  const abortFromRequest = () => streamAbort.abort(request.signal.reason);
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (payload: Record<string, unknown>) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      void (async () => {
        try {
          send({ type: "progress", event: "request.accepted" });
          if (isMockRequest(request)) {
            for (const event of [
              "generation.started",
              "generation.completed",
              "filtering.started",
              "filtering.completed",
              "evaluation.started",
              "evaluation.completed",
              "rejection.completed",
              "selection.completed"
            ]) send({ type: "progress", event });
            send({
              type: "result",
              data: { runs: [{ model: "mock", label: "Mock fixture", directions: MOCK_DIRECTIONS }], rejectedRuns: [], mock: true }
            });
            finish();
            return;
          }
          const client = openAIClient();
          if (!client) throw new Error("Direction generation isn’t connected. Add a valid OPENAI_API_KEY and restart.");
          const settled = await deduplicate(requestKey("directions", input), () =>
            Promise.allSettled(COMPARISON_MODELS.map(async ({ model, label }) => {
              const result = await generateAndEvaluateDirections({
                client,
                model,
                requestSignal: streamAbort.signal,
                progress: (event, detail) => send({ type: "progress", event, ...detail }),
                ...input
              });
              return { model, label, ...result };
            }))
          );
          const runs = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
          const rejectedRuns = settled.flatMap((result, index) => {
            if (result.status === "rejected") {
              return [{ model: COMPARISON_MODELS[index].model, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }];
            }
            return result.value.directions.length < 3
              ? [{ model: result.value.model, error: `Only ${result.value.directions.length} directions passed.\n${result.value.rejectionFeedback}` }]
              : [];
          });
          if (rejectedRuns.length > 0) console.warn("Direction comparison runs rejected", rejectedRuns);
          const passingCount = runs.reduce((total, run) => total + run.directions.length, 0);
          if (passingCount < 3) throw new Error(`Only ${passingCount} total directions passed.`);
          send({ type: "progress", event: "selection.completed" });
          send({
            type: "result",
            data: { runs: runs.map(({ rejectionFeedback: _feedback, ...run }) => run), rejectedRuns }
          });
        } catch (error) {
          const cancelled = streamAbort.signal.aborted || (error instanceof Error && error.name === "AbortError");
          send({
            type: cancelled ? "cancelled" : "error",
            error: cancelled
              ? "Generation cancelled. Everything you entered is still here."
              : "I couldn’t finish those literary options. Your choices and edits are still here—please try again.",
            ...(process.env.NODE_ENV === "development" && error instanceof Error ? { diagnostic: error.message } : {})
          });
        } finally {
          request.signal.removeEventListener("abort", abortFromRequest);
          finish();
        }
      })();
    },
    cancel() {
      streamAbort.abort(new Error("Client disconnected"));
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}
