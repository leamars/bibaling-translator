import { z } from "zod";
import { isMockRequest, openAIClient } from "../generation";
import { MOCK_DIRECTIONS } from "../mock-fixtures";
import {
  DIRECTION_PIPELINE_CONFIG,
  DirectionPipelineError,
  classifyStageFailure,
  deriveRefrainBudget,
  directionDraftCacheKey,
  editorialOptionsSchema,
  finalDirectionSetViolations,
  parentMessageFor,
  parseCompletedOutput,
  privateCandidatesSchema,
  refrainBudgetViolations,
  resolveDirectionDraft,
  validatePrivateCandidates,
  type CachedDirectionDraft
} from "../direction-pipeline";
import {
  MAX_ACTION_COST_USD,
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
  previousRefrains: z.array(z.string().min(1)).max(100).default([]),
  freshDraft: z.boolean().default(false)
});
type DirectionInput = z.infer<typeof bodySchema>;

function privateCandidateJsonSchema(maximumRefrainCharacters: number) {
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: DIRECTION_PIPELINE_CONFIG.drafting.candidateCount,
      maxItems: DIRECTION_PIPELINE_CONFIG.drafting.candidateCount,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 40 },
          refrain: { type: "string", maxLength: maximumRefrainCharacters },
          approach: { type: "string", maxLength: 120 }
        },
        required: ["name", "refrain", "approach"]
      }
    }
  },
  required: ["candidates"]
  } as const;
}

function editorialJsonSchema(maximumRefrainCharacters: number) {
  return {
  type: "object",
  additionalProperties: false,
  properties: {
    options: {
      type: "array",
      minItems: DIRECTION_PIPELINE_CONFIG.editorial.optionCount,
      maxItems: DIRECTION_PIPELINE_CONFIG.editorial.optionCount,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceCandidateIndex: {
            type: "integer",
            minimum: -1,
            maximum: DIRECTION_PIPELINE_CONFIG.drafting.candidateCount - 1
          },
          label: { type: "string", maxLength: 40 },
          refrain: { type: "string", maxLength: maximumRefrainCharacters },
          description: { type: "string", maxLength: 120 },
          genderDependency: { type: "string", maxLength: 120 },
          construction: {
            type: "string",
            enum: ["couplet", "playful_hook", "lyrical_refrain"]
          },
          rhymePairs: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                endingA: { type: "string", maxLength: 30 },
                endingB: { type: "string", maxLength: 30 }
              },
              required: ["endingA", "endingB"]
            }
          }
        },
        required: [
          "sourceCandidateIndex", "label", "refrain", "description", "genderDependency",
          "construction", "rhymePairs"
        ]
      }
    }
  },
  required: ["options"]
  } as const;
}

function logStageFailure(stage: "draft" | "editor", error: DirectionPipelineError) {
  const config = stage === "draft" ? DIRECTION_PIPELINE_CONFIG.drafting : DIRECTION_PIPELINE_CONFIG.editorial;
  console.error("direction_pipeline_failure", JSON.stringify({
    stage,
    code: error.code,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    timeoutMs: config.timeoutMs,
    maxOutputTokens: config.maxOutputTokens,
    message: error.message
  }));
}

function assertDirectionBudget() {
  const maximumActionCost =
    assertActionBudget({
      model: DIRECTION_PIPELINE_CONFIG.drafting.model,
      maxInputTokens: 4_000,
      maxOutputTokens: DIRECTION_PIPELINE_CONFIG.drafting.maxOutputTokens,
      callCount: 1
    }) +
    assertActionBudget({
      model: DIRECTION_PIPELINE_CONFIG.editorial.model,
      maxInputTokens: 4_000,
      maxOutputTokens: DIRECTION_PIPELINE_CONFIG.editorial.maxOutputTokens,
      callCount: 1
    });
  if (maximumActionCost > MAX_ACTION_COST_USD) {
    throw new Error(
      `Estimated maximum action cost $${maximumActionCost.toFixed(4)} exceeds the configured $${MAX_ACTION_COST_USD.toFixed(4)} limit.`
    );
  }
}

async function draftCandidates(args: {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  input: DirectionInput;
  requestSignal: AbortSignal;
  progress: (event: string, detail?: Record<string, unknown>) => void;
}) {
  args.progress("drafting_started");
  try {
    const refrainBudget = deriveRefrainBudget(args.input.texts);
    const prompt = directionsGenerationPrompt({
      texts: args.input.texts,
      visualContexts: args.input.visualContexts,
      priority: args.input.priority,
      freedom: args.input.freedom,
      parentFeedback: args.input.parentFeedback,
      previousRefrains: args.input.previousRefrains,
      refrainBudget
    });
    const { response, usage } = await controlledResponse({
      client: args.client,
      requestSignal: args.requestSignal,
      action: "directions.draft",
      model: DIRECTION_PIPELINE_CONFIG.drafting.model,
      maxOutputTokens: DIRECTION_PIPELINE_CONFIG.drafting.maxOutputTokens,
      timeoutMs: DIRECTION_PIPELINE_CONFIG.drafting.timeoutMs,
      body: {
        model: DIRECTION_PIPELINE_CONFIG.drafting.model,
        reasoning: { effort: DIRECTION_PIPELINE_CONFIG.drafting.reasoningEffort },
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "private_refrain_candidates",
            strict: true,
            schema: privateCandidateJsonSchema(refrainBudget.maximumCharacterCount)
          }
        }
      }
    });
    const parsed = parseCompletedOutput(response, "draft", privateCandidatesSchema);
    args.progress("drafting_completed", { usage });
    args.progress("validating_candidates");
    const validation = validatePrivateCandidates(parsed.candidates, refrainBudget);
    return {
      candidates: validation.survivors,
      rawCandidates: parsed.candidates,
      rejections: validation.rejections,
      budget: refrainBudget
    };
  } catch (error) {
    const typed = classifyStageFailure("draft", error, args.requestSignal.aborted);
    logStageFailure("draft", typed);
    throw typed;
  }
}

async function editCandidates(args: {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  input: DirectionInput;
  candidates: CachedDirectionDraft["candidates"];
  requestSignal: AbortSignal;
  progress: (event: string, detail?: Record<string, unknown>) => void;
}) {
  args.progress("editing_started", { candidateCount: args.candidates.length });
  try {
    const refrainBudget = deriveRefrainBudget(args.input.texts);
    const prompt = directionsEvaluationPrompt({
      texts: args.input.texts,
      visualContexts: args.input.visualContexts,
      priority: args.input.priority,
      freedom: args.input.freedom,
      directionsJson: JSON.stringify(args.candidates),
      refrainBudget
    });
    const { response, usage } = await controlledResponse({
      client: args.client,
      requestSignal: args.requestSignal,
      action: "directions.edit",
      model: DIRECTION_PIPELINE_CONFIG.editorial.model,
      maxOutputTokens: DIRECTION_PIPELINE_CONFIG.editorial.maxOutputTokens,
      timeoutMs: DIRECTION_PIPELINE_CONFIG.editorial.timeoutMs,
      body: {
        model: DIRECTION_PIPELINE_CONFIG.editorial.model,
        reasoning: { effort: DIRECTION_PIPELINE_CONFIG.editorial.reasoningEffort },
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "parent_refrain_options",
            strict: true,
            schema: editorialJsonSchema(refrainBudget.maximumCharacterCount)
          }
        }
      }
    });
    const parsed = parseCompletedOutput(response, "editor", editorialOptionsSchema);
    const optionChecks = parsed.options.map((option, index, all) => ({
      option,
      reasons: [
        ...deterministicViolations(option.refrain, { requireCompleteSentence: false }),
        ...refrainBudgetViolations(option.refrain, refrainBudget),
        ...(all.findIndex((other) =>
          other.refrain.trim().toLocaleLowerCase("sl") === option.refrain.trim().toLocaleLowerCase("sl")
        ) === index ? [] : ["duplicates another editorial option"])
      ]
    }));
    const options = optionChecks.filter((check) => check.reasons.length === 0).map((check) => check.option);
    if (options.length !== DIRECTION_PIPELINE_CONFIG.editorial.optionCount) {
      throw new DirectionPipelineError(
        "EDITOR_INVALID_OUTPUT",
        "The editor did not return three valid unique options.",
        {
          rawEditorialOptions: parsed.options,
          editorialRejections: optionChecks
            .filter((check) => check.reasons.length > 0)
            .map((check) => ({ option: check.option, reasons: check.reasons })),
          usage
        }
      );
    }
    const setViolations = finalDirectionSetViolations(
      options,
      args.input.priority === "rhythm",
      args.candidates.length
    );
    if (setViolations.length > 0) {
      throw new DirectionPipelineError(
        "EDITOR_INVALID_OUTPUT",
        `The editor returned a set that failed rhyme or diversity validation: ${setViolations.join("; ")}`,
        { rawEditorialOptions: parsed.options, setViolations, usage }
      );
    }
    args.progress("editing_completed", { usage });
    return {
      directions: options.map((option) => ({
        name: option.label,
        refrain: option.refrain,
        approach: option.description,
        genderDependency: option.genderDependency
      })),
      editorialOptions: options
    };
  } catch (error) {
    const typed = classifyStageFailure("editor", error, args.requestSignal.aborted);
    logStageFailure("editor", typed);
    throw typed;
  }
}

async function generateAndEvaluateDirections(args: {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  input: DirectionInput;
  requestSignal: AbortSignal;
  progress: (event: string, detail?: Record<string, unknown>) => void;
}) {
  assertDirectionBudget();
  const cacheInput = { ...args.input, freshDraft: undefined };
  const cacheKey = directionDraftCacheKey(cacheInput);
  const draft = await resolveDirectionDraft({
    key: cacheKey,
    freshDraft: args.input.freshDraft,
    generate: () => draftCandidates(args)
  });
  if (draft.reused) {
    args.progress("drafting_completed", { reused: true });
    args.progress("validating_candidates", { reused: true, candidateCount: draft.draft.candidates.length });
  }
  const edited = await editCandidates({ ...args, candidates: draft.draft.candidates });
  return {
    directions: edited.directions,
    editorialOptions: edited.editorialOptions,
    reusedDraft: draft.reused,
    draft: draft.draft
  };
}

export async function POST(request: Request) {
  const input = bodySchema.parse(await request.json());
  const includeDiagnostics = request.headers.get("x-bibaling-live-evaluation") === "true";
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
          if (isMockRequest(request)) {
            for (const event of [
              "drafting_started",
              "drafting_completed",
              "validating_candidates",
              "editing_started",
              "editing_completed",
              "completed"
            ]) send({ type: "progress", event });
            send({
              type: "result",
              data: { runs: [{ model: "mock", label: "Mock fixture", directions: MOCK_DIRECTIONS }], mock: true }
            });
            finish();
            return;
          }

          const client = openAIClient();
          if (!client) throw new DirectionPipelineError("NETWORK_FAILURE", "Direction generation is not configured.");
          const result = await deduplicate(requestKey("directions-v3", input), () =>
            generateAndEvaluateDirections({
              client,
              input,
              requestSignal: streamAbort.signal,
              progress: (event, detail) => send({ type: "progress", event, ...detail })
            })
          );
          send({ type: "progress", event: "completed" });
          send({
            type: "result",
            data: {
              runs: [{
                model: DIRECTION_PIPELINE_CONFIG.editorial.model,
                label: "Sol · quality-first",
                directions: result.directions
              }],
              reusedDraft: result.reusedDraft,
              ...(includeDiagnostics ? {
                evaluationDiagnostics: {
                  budget: result.draft.budget,
                  rawCandidates: result.draft.rawCandidates,
                  survivors: result.draft.candidates,
                  rejections: result.draft.rejections,
                  editorialOptions: result.editorialOptions
                }
              } : {})
            }
          });
        } catch (error) {
          const cancelled = streamAbort.signal.aborted || (error instanceof Error && error.name === "AbortError");
          const typed = error instanceof DirectionPipelineError
            ? error
            : new DirectionPipelineError("NETWORK_FAILURE", "Direction pipeline failed.", error);
          if (!cancelled) send({
            type: "error",
            event: "failed",
            code: typed.code,
            retryMode: typed.code.startsWith("EDITOR_") ? "editor_only" : "full",
            error: parentMessageFor(typed.code),
            ...(includeDiagnostics && typed.cause && typeof typed.cause === "object"
              ? { evaluationDiagnostics: typed.cause }
              : {}),
            ...(process.env.NODE_ENV === "development" ? { diagnostic: typed.message } : {})
          });
          else send({
            type: "cancelled",
            event: "failed",
            code: "NETWORK_FAILURE",
            error: "Generation cancelled. Everything you entered is still here."
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
