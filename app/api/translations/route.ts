import { NextResponse } from "next/server";
import { z } from "zod";
import { QUALITY_MODEL, generationError, isMockRequest, openAIClient } from "../generation";
import { mockOptions } from "../mock-fixtures";
import {
  assertActionBudget,
  controlledResponse,
  deduplicate,
  requestKey
} from "../openai-control";
import {
  BOOK_FORMS,
  SOURCE_RHYME,
  requiresRhyme,
  type BookForm,
  type SourceRhyme
} from "../book-form-contract.ts";
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
  deterministicViolations,
  failedFullBookGates
} from "../translation-quality";
import {
  productionPageEditorialJsonSchema,
  productionPageEditorialResultSchema,
  resolveProductionPageResult
} from "../page-editorial-contract.ts";
import {
  resolveLanguageSelection,
  languageConfig,
  targetLanguageSchema,
  type TargetLanguage
} from "../../languages/language-config.ts";

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
const languageFields = {
  targetLanguage: targetLanguageSchema.default("sl"),
  regionalVariant: z.string().max(20).optional()
};

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("spread1"),
    visualContext: visualContextSchema,
    source: z.string().min(1),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    bookForm: z.enum(BOOK_FORMS),
    sourceRhyme: z.enum(SOURCE_RHYME),
    direction: directionSchema.optional(),
    previousOptions: z.array(z.string().min(1).max(4_000)).max(3).optional(),
    ...languageFields
  }),
  // The workshop happens before email capture, so pattern testing carries no
  // lead receipt: the email gate now sits after the page-4 teaser, and only
  // full-book delivery requires it.
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
    approvedSpread1Note: z.string().max(1200).optional(),
    ...languageFields
  }),
  // Teaser: one page written in the locked voice while the parent watches.
  // Its text is returned both for the visible Page 4 preview and for seeding
  // durable delivery, so the completed preview call is never wasted.
  z.object({
    mode: z.literal("preview"),
    spread: z.object({
      spread: z.number().int().positive(),
      visualContext: visualContextSchema,
      source: z.string().min(1)
    }),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    bookForm: z.enum(BOOK_FORMS),
    sourceRhyme: z.enum(SOURCE_RHYME),
    direction: directionSchema.optional(),
    approvedVoice: z.array(z.object({
      spread: z.number().int().positive(),
      text: z.string().min(1),
      parentNote: z.string().max(1200).optional()
    })).min(1).max(3),
    ...languageFields
  })
]).superRefine((input, context) => {
  if (input.bookForm === "refrain_verse" && !input.direction) {
    context.addIssue({ code: "custom", message: "refrain_verse requires a parent-approved direction", path: ["direction"] });
  }
  if (input.bookForm !== "refrain_verse" && input.direction) {
    context.addIssue({ code: "custom", message: "non-refrain workflows must not send a direction", path: ["direction"] });
  }
  try {
    resolveLanguageSelection(input.targetLanguage, input.regionalVariant);
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid language variant", path: ["regionalVariant"] });
  }
});

const candidateSchema = z.object({
  id: z.string().min(1),
  strategy: z.string().min(1),
  text: z.string().min(1)
});
const CANDIDATE_COUNT = 6;
const candidatePoolSchema = z.object({ candidates: z.array(candidateSchema).length(CANDIDATE_COUNT) });
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
  return productionPageEditorialJsonSchema;
}

const fullBookItemSchema = z.object({
  spread: z.number().int().positive(),
  text: z.string().min(1),
  fidelityPass: z.boolean().optional(),
  grammarPass: z.boolean().optional(),
  readAloudPass: z.boolean().optional(),
  directionPass: z.boolean().optional(),
  rhymePass: z.boolean().optional()
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
  previousOptions?: string[];
  targetLanguage: TargetLanguage;
  regionalVariant?: string;
  requestSignal: AbortSignal;
};

async function generatePassingOptions(args: PipelineArgs) {
  const requestTimeoutMs = args.spreadNumber === 1 && !args.approvedSpread1 ? 120_000 : 90_000;
  const previousOptionTexts = new Set(
    (args.previousOptions || []).map((option) => option.trim().toLocaleLowerCase(args.targetLanguage))
  );
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
                approvedSpread1Note: args.approvedSpread1Note,
                previousOptions: args.previousOptions,
                targetLanguage: args.targetLanguage,
                regionalVariant: args.regionalVariant
              })
            }
          ]
        }],
        text: { format: { type: "json_schema", name: "private_translation_candidates", strict: true, schema: candidateJsonSchema } }
      }
    });
    const pool = candidatePoolSchema.parse(JSON.parse(generationResponse.output_text));
    const survivors = pool.candidates.filter((candidate) => {
      const normalized = candidate.text.trim().toLocaleLowerCase(args.targetLanguage);
      return deterministicViolations(candidate.text, { targetLanguage: args.targetLanguage }).length === 0 &&
        !previousOptionTexts.has(normalized);
    });
    if (survivors.length < 3) {
      throw new Error(`Only ${survivors.length} translations survived deterministic quality checks.`);
    }

    const { response: evaluationResponse } = await controlledResponse({
      client: args.client,
      requestSignal: args.requestSignal,
      action: `spread${args.spreadNumber}.evaluate`,
      model: "gpt-5.6-sol",
      maxOutputTokens: 3_500,
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
                previousOptions: args.previousOptions,
                candidatesJson: JSON.stringify(survivors),
                targetLanguage: args.targetLanguage,
                regionalVariant: args.regionalVariant
              })
            }
          ]
        }],
        text: { format: { type: "json_schema", name: "translation_editorial_finalists", strict: true, schema: editorialJsonSchema() } }
      }
    });
    const edited = productionPageEditorialResultSchema.parse(JSON.parse(evaluationResponse.output_text));
    // Hard gates: reader-facing text only — banned content, placeholders,
    // meta-commentary, duplicates. Editorial bookkeeping never hard-fails.
    const textEligible = edited.finalists.filter((candidate) => {
      const normalized = candidate.text.trim().toLocaleLowerCase(args.targetLanguage);
      return deterministicViolations(candidate.text, { targetLanguage: args.targetLanguage }).length === 0 &&
        !previousOptionTexts.has(normalized);
    });
    if (textEligible.length !== 3 || new Set(
      textEligible.map((candidate) => candidate.text.trim().toLocaleLowerCase(args.targetLanguage))
    ).size !== 3) {
      throw Object.assign(
        new Error("The editorial response contained malformed or duplicate finalist text."),
        { code: "FINAL_TEXT_INVALID" }
      );
    }
    const rhymeRequired = requiresRhyme({
      bookForm: args.bookForm,
      sourceRhyme: args.sourceRhyme,
      priority: args.priority
    });
    const selection = resolveProductionPageResult({
      result: edited,
      rhymeRequired,
      sourceCandidates: survivors
    });
    if (!selection.ok) {
      // Translation-level rejection: the editor judged every finalist to fail
      // at least one of its own quality gates.
      throw Object.assign(new Error(selection.error.message), selection.error);
    }
    if (selection.warnings.length > 0) {
      console.warn("editorial_metadata_warnings", JSON.stringify({
        action: `spread${args.spreadNumber}.evaluate`,
        warnings: selection.warnings
      }));
    }
    return selection.finalists.map((finalist) => ({
      strategy: survivors.find((candidate) => candidate.id === finalist.sourceCandidateId)?.strategy || "Editorial finalist",
      text: finalist.text,
      rank: finalist.rank,
      recommendedFinalist: finalist === selection.recommended,
    }));
}

// Teaser generation: one page written in the locked voice with the approved
// workshop pages as binding references. Same draft → editorial shape as the
// delivery workflow, so the returned text can seed that page's delivery draft.
async function generatePreviewPage(args: {
  client: NonNullable<ReturnType<typeof openAIClient>>;
  requestSignal: AbortSignal;
  input: Extract<z.infer<typeof bodySchema>, { mode: "preview" }>;
}) {
  const { input } = args;
  assertActionBudget({
    model: QUALITY_MODEL.model,
    maxInputTokens: 8_000,
    maxOutputTokens: 3_500,
    callCount: 2
  });
  const promptArgs = {
    spreads: [input.spread],
    priority: input.priority,
    freedom: input.freedom,
    bookForm: input.bookForm,
    sourceRhyme: input.sourceRhyme,
    direction: input.direction,
    approvedVoice: input.approvedVoice,
    targetLanguage: input.targetLanguage,
    regionalVariant: input.regionalVariant
  };
  const { response: draftResponse } = await controlledResponse({
    client: args.client,
    requestSignal: args.requestSignal,
    action: `preview.page.${input.spread.spread}.generate`,
    model: QUALITY_MODEL.model,
    maxOutputTokens: 3_500,
    timeoutMs: 90_000,
    body: {
      model: QUALITY_MODEL.model,
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: fullBookGenerationPrompt({ ...promptArgs, spreads: [{ spread: input.spread.spread, source: input.spread.source, visualContext: input.spread.visualContext }] }) }
        ]
      }],
      text: { format: { type: "json_schema", name: "preview_page_draft", strict: true, schema: fullBookJsonSchema(1, false) } }
    }
  });
  const draft = z.object({
    spreads: z.array(fullBookItemSchema.pick({ spread: true, text: true })).length(1)
  }).parse(JSON.parse(draftResponse.output_text));

  const { response: editorialResponse } = await controlledResponse({
    client: args.client,
    requestSignal: args.requestSignal,
    action: `preview.page.${input.spread.spread}.edit`,
    model: QUALITY_MODEL.model,
    maxOutputTokens: 3_500,
    timeoutMs: 90_000,
    body: {
      model: QUALITY_MODEL.model,
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: fullBookEditorialPrompt({
              ...promptArgs,
              spreads: [{ spread: input.spread.spread, source: input.spread.source, visualContext: input.spread.visualContext }],
              draftsJson: JSON.stringify(draft.spreads)
            })
          }
        ]
      }],
      text: { format: { type: "json_schema", name: "preview_page_final", strict: true, schema: fullBookJsonSchema(1, true) } }
    }
  });
  const final = z.object({
    spreads: z.array(fullBookItemSchema.extend({
      fidelityPass: z.boolean(),
      grammarPass: z.boolean(),
      readAloudPass: z.boolean(),
      directionPass: z.boolean(),
      rhymePass: z.boolean()
    })).length(1)
  }).parse(JSON.parse(editorialResponse.output_text));
  const page = final.spreads[0];
  if (
    page.spread !== input.spread.spread ||
    deterministicViolations(page.text, { targetLanguage: input.targetLanguage }).length > 0
  ) {
    throw new Error("The preview editorial response did not contain a valid translation for the requested page.");
  }
  const failedGates = failedFullBookGates([page], requiresRhyme({
    bookForm: input.bookForm,
    sourceRhyme: input.sourceRhyme,
    priority: input.priority
  }));
  if (failedGates.length > 0) {
    throw new Error(
      `The preview editorial pass reported failed quality gates: ${failedGates[0].failed.join(", ")}.`
    );
  }
  return { spread: page.spread, text: page.text };
}

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    if (isMockRequest(request)) {
      if (input.mode === "preview") {
        return NextResponse.json({
          spread: input.spread.spread,
          text: `[MOCK ${languageConfig(input.targetLanguage).name} — NOT QUALITY EVALUATED] Preview page ${input.spread.spread}.`,
          mock: true
        });
      }
      const spreads = input.mode === "spread1"
        ? undefined
        : [2, 3].map((spread) => ({ spread, options: mockOptions(spread, languageConfig(input.targetLanguage).name) }));
      return NextResponse.json({
        runs: [{
          model: "mock",
          label: "Mock fixture",
          ...(input.mode === "spread1" ? { options: mockOptions(1, languageConfig(input.targetLanguage).name) } : { spreads })
        }],
        mock: true
      });
    }
    const client = openAIClient();
    if (!client) return NextResponse.json({ error: "Translation generation isn’t connected right now. Please try again later." }, { status: 503 });
    if (input.mode === "preview") {
      const preview = await deduplicate(requestKey("preview", input), () =>
        generatePreviewPage({ client, requestSignal: request.signal, input })
      );
      return NextResponse.json(preview);
    }
    assertActionBudget({
      model: QUALITY_MODEL.model,
      maxInputTokens: 4_000,
      maxOutputTokens: 3_500,
      callCount: input.mode === "spread1" ? 2 : 4
    });

    if (input.mode === "spread1") {
      const run = await deduplicate(requestKey("spread1", input), async () => ({
        model: QUALITY_MODEL.model,
        label: QUALITY_MODEL.label,
        options: await generatePassingOptions({
          client,
          model: QUALITY_MODEL.model,
          visualContext: input.visualContext,
          spreadNumber: 1,
          source: input.source,
          priority: input.priority,
          freedom: input.freedom,
          bookForm: input.bookForm,
          sourceRhyme: input.sourceRhyme,
          direction: input.direction,
          previousOptions: input.previousOptions,
          targetLanguage: input.targetLanguage,
          regionalVariant: input.regionalVariant,
          requestSignal: request.signal
        })
      }));
      return NextResponse.json({ runs: [run] });
    }

    const run = await deduplicate(requestKey("pattern", input), async () => {
      const spreads = await Promise.all([2, 3].map(async (spreadNumber, index) => ({
        spread: spreadNumber,
        options: await generatePassingOptions({
          client,
          model: QUALITY_MODEL.model,
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
          targetLanguage: input.targetLanguage,
          regionalVariant: input.regionalVariant,
          requestSignal: request.signal
        })
      })));
      return { model: QUALITY_MODEL.model, label: QUALITY_MODEL.label, spreads };
    });
    return NextResponse.json({ runs: [run] });
  } catch (error) {
    return generationError(
      error,
      "We couldn’t finish these translations. Your direction, choices, and edits are still here—please try again."
    );
  }
}
