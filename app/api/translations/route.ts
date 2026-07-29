import { NextResponse } from "next/server";
import { z } from "zod";
import { COMPARISON_MODELS, generationError, isMockRequest, openAIClient } from "../generation";
import { mockOptions } from "../mock-fixtures";
import {
  assertActionBudget,
  controlledResponse,
  deduplicate,
  requestKey
} from "../openai-control";
import { BOOK_FORMS, SOURCE_RHYME, type BookForm, type SourceRhyme } from "../book-form-contract.ts";
import {
  fullBookEditorialPrompt,
  fullBookGenerationPrompt,
  translationEvaluationPrompt,
  translationGenerationPrompt,
  type DirectionBrief,
  type Freedom,
  type Priority
} from "../translation-prompts";
import {
  deterministicViolations
} from "../translation-quality";
import { verifyLeadReceipt } from "../leads/receipt";

export const runtime = "nodejs";

const directionSchema = z.object({
  name: z.string().min(1),
  refrain: z.string().min(1),
  approach: z.string().min(1),
  genderDependency: z.string().min(1)
});

// OCR can safely recover the complete source text even when optional image
// analysis is interrupted. Translation must remain available in that case.
const visualContextSchema = z.string().max(4_000);

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("spread1"),
    visualContext: visualContextSchema,
    source: z.string().min(1),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    bookForm: z.enum(BOOK_FORMS),
    sourceRhyme: z.enum(SOURCE_RHYME),
    direction: directionSchema.optional()
  }),
  z.object({
    mode: z.literal("pattern"),
    visualContexts: z.array(visualContextSchema).length(2),
    sources: z.array(z.string().min(1)).length(2),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    bookForm: z.enum(BOOK_FORMS),
    sourceRhyme: z.enum(SOURCE_RHYME),
    direction: directionSchema.optional(),
    approvedSpread1: z.string().min(1),
    approvedSpread1Note: z.string().max(1200).optional()
  }),
  z.object({
    mode: z.literal("fullbook"),
    leadReceipt: z.string().min(1),
    spreads: z.array(z.object({
      spread: z.number().int().positive(),
      visualContext: visualContextSchema,
      source: z.string().min(1)
    })).min(1).max(40),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    bookForm: z.enum(BOOK_FORMS),
    sourceRhyme: z.enum(SOURCE_RHYME),
    direction: directionSchema.optional(),
    approvedVoice: z.array(z.object({
      spread: z.number().int().positive(),
      text: z.string().min(1),
      parentNote: z.string().max(1200).optional()
    })).length(3)
  })
]).superRefine((input, context) => {
  if (input.bookForm === "refrain_verse" && !input.direction) {
    context.addIssue({ code: "custom", message: "refrain_verse requires a parent-approved direction", path: ["direction"] });
  }
  if (input.bookForm !== "refrain_verse" && input.direction) {
    context.addIssue({ code: "custom", message: "non-refrain workflows must not send a direction", path: ["direction"] });
  }
});

const candidateSchema = z.object({
  id: z.string().min(1),
  strategy: z.string().min(1),
  text: z.string().min(1)
});
const CANDIDATE_COUNT = 6;
const candidatePoolSchema = z.object({ candidates: z.array(candidateSchema).length(CANDIDATE_COUNT) });
const finalistSchema = z.object({
    sourceCandidateId: z.string().min(1),
    strategy: z.string().min(1),
    text: z.string().min(1),
    fidelityPass: z.literal(true),
    grammarPass: z.literal(true),
    readAloudPass: z.literal(true),
    directionPass: z.literal(true),
    rhymePass: z.literal(true)
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
          sourceCandidateId: { type: "string" },
          strategy: { type: "string" },
          text: { type: "string" },
          fidelityPass: { type: "boolean" },
          grammarPass: { type: "boolean" },
          readAloudPass: { type: "boolean" },
          directionPass: { type: "boolean" },
          rhymePass: { type: "boolean" }
        },
        required: [
          "sourceCandidateId",
          "strategy",
          "text",
          "fidelityPass",
          "grammarPass",
          "readAloudPass",
          "directionPass",
          "rhymePass"
        ]
      }
    }
  },
  required: ["finalists"]
  } as const;
}

const fullBookItemSchema = z.object({
  spread: z.number().int().positive(),
  text: z.string().min(1),
  fidelityPass: z.literal(true).optional(),
  grammarPass: z.literal(true).optional(),
  readAloudPass: z.literal(true).optional(),
  directionPass: z.literal(true).optional(),
  rhymePass: z.literal(true).optional()
});

function fullBookJsonSchema(spreadCount: number, editorial: boolean) {
  const properties: Record<string, unknown> = {
    spread: { type: "integer" },
    text: { type: "string" }
  };
  const required = ["spread", "text"];
  if (editorial) {
    Object.assign(properties, {
      fidelityPass: { type: "boolean" },
      grammarPass: { type: "boolean" },
      readAloudPass: { type: "boolean" },
      directionPass: { type: "boolean" },
      rhymePass: { type: "boolean" }
    });
    required.push("fidelityPass", "grammarPass", "readAloudPass", "directionPass", "rhymePass");
  }
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      spreads: {
        type: "array",
        minItems: spreadCount,
        maxItems: spreadCount,
        items: { type: "object", additionalProperties: false, properties, required }
      }
    },
    required: ["spreads"]
  } as const;
}

type PipelineArgs = {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  model: string;
  visualContext: string;
  spreadNumber: number;
  source: string;
  priority: Priority;
  freedom: Freedom;
  bookForm: BookForm;
  sourceRhyme: SourceRhyme;
  direction?: DirectionBrief;
  approvedSpread1?: string;
  approvedSpread1Note?: string;
  requestSignal: AbortSignal;
};

async function generatePassingOptions(args: PipelineArgs) {
  const requestTimeoutMs = args.spreadNumber === 1 && !args.approvedSpread1 ? 120_000 : 90_000;
  const { response: generationResponse } = await controlledResponse({
    client: args.client,
    requestSignal: args.requestSignal,
    action: `spread${args.spreadNumber}.generate`,
    model: args.model,
    maxOutputTokens: 3_500,
    timeoutMs: requestTimeoutMs,
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
                visualContext: args.visualContext,
                priority: args.priority,
                freedom: args.freedom,
                bookForm: args.bookForm,
                sourceRhyme: args.sourceRhyme,
                direction: args.direction,
                approvedSpread1: args.approvedSpread1,
                approvedSpread1Note: args.approvedSpread1Note
              })
            }
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
      timeoutMs: requestTimeoutMs,
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
                visualContext: args.visualContext,
                priority: args.priority,
                freedom: args.freedom,
                bookForm: args.bookForm,
                sourceRhyme: args.sourceRhyme,
                direction: args.direction,
                approvedSpread1: args.approvedSpread1,
                approvedSpread1Note: args.approvedSpread1Note,
                candidatesJson: JSON.stringify(survivors)
              })
            }
          ]
        }],
        text: { format: { type: "json_schema", name: "translation_editorial_finalists", strict: true, schema: editorialJsonSchema() } }
      }
    });
    const edited = z.object({
      finalists: z.array(finalistSchema).length(3)
    }).parse(JSON.parse(evaluationResponse.output_text));
    const passing = edited.finalists
      .filter((candidate) => deterministicViolations(candidate.text).length === 0)
      .filter((candidate, index, all) =>
        all.findIndex((other) => other.text.trim().toLocaleLowerCase("sl") === candidate.text.trim().toLocaleLowerCase("sl")) === index
      )
      .map(({ strategy, text }) => ({ strategy, text }));

    if (passing.length !== 3) {
      throw new Error(`Only ${passing.length} editorial finalists passed deterministic quality checks`);
    }
    return passing;
}

async function generateFullBook(args: {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  requestSignal: AbortSignal;
  input: Extract<z.infer<typeof bodySchema>, { mode: "fullbook" }>;
}) {
  const { input } = args;
  assertActionBudget({
    model: "gpt-5.6-sol",
    maxInputTokens: 12_000,
    maxOutputTokens: 5_000,
    callCount: 2
  });
  const promptArgs = {
    spreads: input.spreads.map(({ spread, source, visualContext }) => ({ spread, source, visualContext })),
    priority: input.priority,
    freedom: input.freedom,
    bookForm: input.bookForm,
    sourceRhyme: input.sourceRhyme,
    direction: input.direction,
    approvedVoice: input.approvedVoice
  };
  const { response: draftResponse } = await controlledResponse({
    client: args.client,
    requestSignal: args.requestSignal,
    action: "fullbook.generate",
    model: "gpt-5.6-sol",
    maxOutputTokens: 5_000,
    timeoutMs: 90_000,
    body: {
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: fullBookGenerationPrompt(promptArgs) }
        ]
      }],
      text: { format: { type: "json_schema", name: "full_book_drafts", strict: true, schema: fullBookJsonSchema(input.spreads.length, false) } }
    }
  });
  const drafts = z.object({
    spreads: z.array(fullBookItemSchema.pick({ spread: true, text: true })).length(input.spreads.length)
  }).parse(JSON.parse(draftResponse.output_text));

  const { response: editorialResponse } = await controlledResponse({
    client: args.client,
    requestSignal: args.requestSignal,
    action: "fullbook.edit",
    model: "gpt-5.6-sol",
    maxOutputTokens: 5_000,
    timeoutMs: 90_000,
    body: {
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: fullBookEditorialPrompt({ ...promptArgs, draftsJson: JSON.stringify(drafts.spreads) })
          }
        ]
      }],
      text: { format: { type: "json_schema", name: "full_book_final", strict: true, schema: fullBookJsonSchema(input.spreads.length, true) } }
    }
  });
  const final = z.object({
    spreads: z.array(fullBookItemSchema.extend({
      fidelityPass: z.literal(true),
      grammarPass: z.literal(true),
      readAloudPass: z.literal(true),
      directionPass: z.literal(true),
      rhymePass: z.literal(true)
    })).length(input.spreads.length)
  }).parse(JSON.parse(editorialResponse.output_text));
  const expected = new Set(input.spreads.map((spread) => spread.spread));
  const unique = new Set(final.spreads.map((spread) => spread.spread));
  if (unique.size !== expected.size || final.spreads.some((spread) =>
    !expected.has(spread.spread) || deterministicViolations(spread.text).length > 0
  )) {
    throw new Error("The full-book editorial response did not contain one valid translation for every spread.");
  }
  return final.spreads.map(({ spread, text }) => ({ spread, text }));
}

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    if (isMockRequest(request)) {
      if (input.mode === "fullbook") {
        return NextResponse.json({
          spreads: input.spreads.map(({ spread }) => ({
            spread,
            text: `[MOCK — NOT QUALITY EVALUATED] Full-book spread ${spread}.`
          })),
          mock: true
        });
      }
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
    if (!client) return NextResponse.json({ error: "Translation generation isn’t connected right now. Please try again later." }, { status: 503 });
    if (input.mode === "fullbook") {
      if (!verifyLeadReceipt(input.leadReceipt, input.bookForm)) {
        return NextResponse.json({ error: "Email capture is required before full-book generation." }, { status: 403 });
      }
      const spreads = await deduplicate(requestKey("fullbook", input), () =>
        generateFullBook({ client, requestSignal: request.signal, input })
      );
      return NextResponse.json({ spreads });
    }
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
          visualContext: input.visualContext,
          spreadNumber: 1,
          source: input.source,
          priority: input.priority,
          freedom: input.freedom,
          bookForm: input.bookForm,
          sourceRhyme: input.sourceRhyme,
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
          visualContext: input.visualContexts[index],
          spreadNumber,
          source: input.sources[index],
          priority: input.priority,
          freedom: input.freedom,
          bookForm: input.bookForm,
          sourceRhyme: input.sourceRhyme,
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
    return generationError(
      error,
      "We couldn’t finish these translations. Your direction, choices, and edits are still here—please try again."
    );
  }
}
