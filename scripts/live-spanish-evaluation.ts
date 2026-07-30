import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import {
  deriveRefrainBudget,
  editorialOptionsSchema,
  privateCandidatesSchema,
  validateDirectionEditorialResult,
  validatePrivateCandidates
} from "../app/api/direction-pipeline.ts";
import {
  directionsEvaluationPrompt,
  directionsGenerationPrompt,
  translationEvaluationPrompt,
  translationGenerationPrompt,
  type DirectionBrief
} from "../app/api/translation-prompts.ts";
import { deterministicViolations } from "../app/api/translation-quality.ts";
import {
  comparativeFinalistFields,
  comparativeJsonProperties,
  comparativeJsonRequired,
  selectRecommendedFinalist,
  winnerComparisonsJsonSchema,
  winnerComparisonsSchema
} from "../app/api/editorial-contract.ts";
import { requiresRhyme } from "../app/api/book-form-contract.ts";
import {
  calculateCost,
  pricingFor,
  type UsageRecord
} from "../app/api/openai-control.ts";
import { MULTILINGUAL_EVALUATION_FIXTURES } from "../tests/fixtures/multilingual-evaluation-fixtures.ts";

const TARGET_LANGUAGE = "es" as const;
const REGIONAL_VARIANT = "es-ES";
const MODEL = "gpt-5.6-sol";
const REASONING_EFFORT = "low";
const DRAFT_TIMEOUT_MS = 120_000;
const EDITOR_TIMEOUT_MS = 120_000;
const MAX_ESTIMATED_COST_USD = 1.80;

function requiredArgument(prefix: string) {
  const value = process.argv.find((argument) => argument.startsWith(`${prefix}=`))
    ?.slice(prefix.length + 1);
  if (!value) throw new Error(`Missing required ${prefix}=... argument.`);
  return resolve(value);
}

function maximumEstimatedCostUsd() {
  const pricing = pricingFor(MODEL);
  const direction = calculateCost(
    { inputTokens: 12_000, cachedInputTokens: 0, outputTokens: 8_500 },
    pricing
  );
  const sixFixtures = 6 * calculateCost(
    { inputTokens: 13_000, cachedInputTokens: 0, outputTokens: 6_000 },
    pricing
  );
  return direction + sixFixtures;
}

const candidateSchema = z.object({
  candidates: z.array(z.object({
    id: z.string(),
    strategy: z.string(),
    text: z.string()
  })).length(6)
});
const editorialSchema = z.object({
  finalists: z.array(z.object({
    sourceCandidateId: z.string(),
    strategy: z.string(),
    text: z.string(),
    fidelityPass: z.boolean(),
    grammarPass: z.boolean(),
    readAloudPass: z.boolean(),
    directionPass: z.boolean(),
    rhymePass: z.boolean(),
    ...comparativeFinalistFields
  })).length(3),
  winnerComparisons: winnerComparisonsSchema
});

const directionDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 40 },
          refrain: { type: "string", maxLength: 320 },
          approach: { type: "string", maxLength: 120 }
        },
        required: ["name", "refrain", "approach"]
      }
    }
  },
  required: ["candidates"]
} as const;

const directionEditorialJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    options: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceCandidateIndex: { type: "integer", minimum: -1, maximum: 4 },
          label: { type: "string", maxLength: 40 },
          refrain: { type: "string", maxLength: 320 },
          description: { type: "string", maxLength: 120 },
          genderDependency: { type: "string", maxLength: 120 },
          construction: { type: "string", enum: ["couplet", "playful_hook", "lyrical_refrain"] },
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
          },
          fidelityPass: { type: "boolean" },
          grammarPass: { type: "boolean" },
          readAloudPass: { type: "boolean" },
          directionPass: { type: "boolean" },
          rhymePass: { type: "boolean" },
          ...comparativeJsonProperties
        },
        required: [
          "sourceCandidateIndex", "label", "refrain", "description",
          "genderDependency", "construction", "rhymePairs", "fidelityPass",
          "grammarPass", "readAloudPass", "directionPass", "rhymePass",
          ...comparativeJsonRequired
        ]
      }
    },
    winnerComparisons: winnerComparisonsJsonSchema
  },
  required: ["options", "winnerComparisons"]
} as const;

const translationDraftJsonSchema = {
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
          text: { type: "string" }
        },
        required: ["id", "strategy", "text"]
      }
    }
  },
  required: ["candidates"]
} as const;

const translationEditorialJsonSchema = {
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
          rhymePass: { type: "boolean" },
          ...comparativeJsonProperties
        },
        required: [
          "sourceCandidateId", "strategy", "text", "fidelityPass",
          "grammarPass", "readAloudPass", "directionPass", "rhymePass",
          ...comparativeJsonRequired
        ]
      }
    },
    winnerComparisons: winnerComparisonsJsonSchema
  },
  required: ["finalists", "winnerComparisons"]
} as const;

function completedJson(response: {
  status?: string;
  output_text?: string;
  incomplete_details?: { reason?: string } | null;
}, stage: string) {
  if (response.status !== "completed" || !response.output_text?.trim()) {
    throw new Error(`${stage} did not complete: ${response.incomplete_details?.reason || response.status || "missing output"}`);
  }
  return JSON.parse(response.output_text);
}

function allPasses(finalist: z.infer<typeof editorialSchema>["finalists"][number]) {
  return finalist.fidelityPass &&
    finalist.grammarPass &&
    finalist.readAloudPass &&
    finalist.directionPass &&
    finalist.rhymePass;
}

function totalUsage(records: UsageRecord[]) {
  return {
    latencyMs: records.reduce((total, usage) => total + usage.latencyMs, 0),
    inputTokens: records.reduce((total, usage) => total + usage.inputTokens, 0),
    cachedInputTokens: records.reduce((total, usage) => total + usage.cachedInputTokens, 0),
    outputTokens: records.reduce((total, usage) => total + usage.outputTokens, 0),
    reasoningTokens: records.reduce((total, usage) => total + usage.reasoningTokens, 0),
    estimatedCostUsd: records.reduce((total, usage) => total + usage.estimatedCostUsd, 0)
  };
}

async function main() {
  if (
    !process.argv.includes("--live") ||
    !process.argv.includes("--language=es-ES") ||
    process.env.CONFIRM_SPANISH_LIVE !== "RUN_SPANISH_EVALUATION"
  ) {
    throw new Error(
      "This paid harness requires --live --language=es-ES and CONFIRM_SPANISH_LIVE=RUN_SPANISH_EVALUATION."
    );
  }
  const maximumCost = maximumEstimatedCostUsd();
  if (maximumCost > MAX_ESTIMATED_COST_USD) {
    throw new Error(
      `Maximum estimated cost $${maximumCost.toFixed(4)} exceeds the controlled-run cap $${MAX_ESTIMATED_COST_USD.toFixed(2)}.`
    );
  }

  const { controlledResponse } = await import("../app/api/openai-control.ts");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_actual_key_here") throw new Error("OPENAI_API_KEY is required.");
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const usage: UsageRecord[] = [];
  const resumedDraftResponsePath = requiredArgument("--resume-draft-response");
  const priorAttemptSummaryPath = requiredArgument("--prior-attempt-summary");
  const [resumedDraftResponse, priorAttemptSummary] = await Promise.all([
    readFile(resumedDraftResponsePath, "utf8").then(JSON.parse),
    readFile(priorAttemptSummaryPath, "utf8").then(JSON.parse)
  ]);
  const mushroomFixtures = MULTILINGUAL_EVALUATION_FIXTURES.filter((fixture) =>
    fixture.sourceBook === "I Love You So Mush"
  );
  const refrainBudget = deriveRefrainBudget(mushroomFixtures.map((fixture) => fixture.source));
  const directionBase = {
    texts: mushroomFixtures.map((fixture) => fixture.source),
    visualContexts: mushroomFixtures.map((fixture) => fixture.visualContext),
    priority: "rhythm" as const,
    freedom: "natural" as const,
    targetLanguage: TARGET_LANGUAGE,
    regionalVariant: REGIONAL_VARIANT,
    refrainBudget
  };
  const directionDraftingPrompt = directionsGenerationPrompt(directionBase);
  const rawDirectionDrafts = privateCandidatesSchema.parse(
    completedJson(resumedDraftResponse, "Saved Spanish refrain drafting")
  ).candidates;
  const directionDraftValidation = validatePrivateCandidates(
    rawDirectionDrafts,
    refrainBudget,
    TARGET_LANGUAGE
  );
  if (directionDraftValidation.survivors.length < 3) {
    throw new Error(`Only ${directionDraftValidation.survivors.length} refrain drafts survived transport validation.`);
  }

  const directionEditorialPrompt = directionsEvaluationPrompt({
    ...directionBase,
    directionsJson: JSON.stringify(directionDraftValidation.survivors)
  });
  const directionEditorialResult = await controlledResponse({
    client,
    requestSignal: AbortSignal.timeout(90_000),
    action: "spanish-eval.refrain.editor",
    model: MODEL,
    maxOutputTokens: 3_500,
    timeoutMs: 90_000,
    body: {
      model: MODEL,
      reasoning: { effort: REASONING_EFFORT },
      input: directionEditorialPrompt,
      text: {
        format: {
          type: "json_schema",
          name: "spanish_refrain_editorial",
          strict: true,
          schema: directionEditorialJsonSchema
        }
      }
    }
  });
  usage.push(directionEditorialResult.usage);
  const parsedDirectionEditorial = editorialOptionsSchema.parse(
    completedJson(directionEditorialResult.response, "Spanish refrain editorial")
  );
  const directionOptions = parsedDirectionEditorial.options;
  const directionDiagnostics = validateDirectionEditorialResult(
    parsedDirectionEditorial,
    refrainBudget,
    true,
    directionDraftValidation.survivors.length,
    TARGET_LANGUAGE
  );
  if (directionDiagnostics.hardFailures.length) {
    throw new Error(`Spanish refrain editorial produced hard failures: ${JSON.stringify(directionDiagnostics.hardFailures)}`);
  }
  const directionSelection = selectRecommendedFinalist({
    finalists: directionOptions,
    winnerComparisons: parsedDirectionEditorial.winnerComparisons,
    rhymeRequired: true
  });
  if (!directionSelection.ok) {
    throw Object.assign(new Error(directionSelection.error.message), directionSelection.error);
  }
  const selectedDirectionOption = directionSelection.finalist;
  const selectedDirection: DirectionBrief = {
    name: selectedDirectionOption.label,
    refrain: selectedDirectionOption.refrain,
    approach: selectedDirectionOption.description,
    genderDependency: selectedDirectionOption.genderDependency
  };

  const fixtureResults = [];
  for (const fixture of MULTILINGUAL_EVALUATION_FIXTURES) {
    const direction = fixture.bookForm === "refrain_verse" ? selectedDirection : undefined;
    const promptBase = {
      spreadNumber: 1,
      source: fixture.source,
      visualContext: fixture.visualContext,
      priority: fixture.priority,
      freedom: fixture.freedom,
      bookForm: fixture.bookForm,
      sourceRhyme: fixture.sourceRhyme,
      direction,
      targetLanguage: TARGET_LANGUAGE,
      regionalVariant: REGIONAL_VARIANT
    };
    const draftingPrompt = translationGenerationPrompt(promptBase);
    const draftResult = await controlledResponse({
      client,
      requestSignal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      action: `spanish-eval.${fixture.id}.draft`,
      model: MODEL,
      maxOutputTokens: 3_500,
      timeoutMs: DRAFT_TIMEOUT_MS,
      body: {
        model: MODEL,
        reasoning: { effort: REASONING_EFFORT },
        input: draftingPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "spanish_translation_drafts",
            strict: true,
            schema: translationDraftJsonSchema
          }
        }
      }
    });
    usage.push(draftResult.usage);
    const draftOptions = candidateSchema.parse(
      completedJson(draftResult.response, `${fixture.id} drafting`)
    ).candidates;
    const draftWarnings = draftOptions.flatMap((candidate) =>
      deterministicViolations(candidate.text, { targetLanguage: TARGET_LANGUAGE })
        .map((warning) => ({ candidateId: candidate.id, warning }))
    );
    const survivors = draftOptions.filter((candidate) =>
      deterministicViolations(candidate.text, { targetLanguage: TARGET_LANGUAGE }).length === 0
    );
    if (survivors.length < 3) {
      throw new Error(`${fixture.id}: only ${survivors.length} drafts survived transport validation.`);
    }

    const editorialPrompt = translationEvaluationPrompt({
      ...promptBase,
      candidatesJson: JSON.stringify(survivors)
    });
    const editorResult = await controlledResponse({
      client,
      requestSignal: AbortSignal.timeout(EDITOR_TIMEOUT_MS),
      action: `spanish-eval.${fixture.id}.editor`,
      model: MODEL,
      maxOutputTokens: 2_500,
      timeoutMs: EDITOR_TIMEOUT_MS,
      body: {
        model: MODEL,
        reasoning: { effort: REASONING_EFFORT },
        input: editorialPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "spanish_translation_editorial",
            strict: true,
            schema: translationEditorialJsonSchema
          }
        }
      }
    });
    usage.push(editorResult.usage);
    const parsedEditorial = editorialSchema.parse(
      completedJson(editorResult.response, `${fixture.id} editorial`)
    );
    const editorialAssessment = parsedEditorial.finalists;
    const editorialWarnings = editorialAssessment.flatMap((finalist) => {
      const warnings = deterministicViolations(finalist.text, { targetLanguage: TARGET_LANGUAGE })
        .map((warning) => ({ candidateId: finalist.sourceCandidateId, warning }));
      if (!allPasses(finalist)) {
        warnings.push({
          candidateId: finalist.sourceCandidateId,
          warning: "The editorial response reported one or more failed quality dimensions."
        });
      }
      return warnings;
    });
    const rhymeRequired = requiresRhyme({
      bookForm: fixture.bookForm,
      sourceRhyme: fixture.sourceRhyme,
      priority: fixture.priority
    });
    const finalSelection = selectRecommendedFinalist({
      finalists: editorialAssessment,
      winnerComparisons: parsedEditorial.winnerComparisons,
      rhymeRequired
    });
    if (!finalSelection.ok) {
      throw Object.assign(new Error(finalSelection.error.message), finalSelection.error);
    }
    const finalSelected = finalSelection.finalist.text;
    fixtureResults.push({
      fixtureId: fixture.id,
      category: fixture.category,
      sourceBook: fixture.sourceBook,
      sourceAsset: fixture.sourceAsset,
      englishSource: fixture.source,
      visualContext: fixture.visualContext,
      bookForm: fixture.bookForm,
      sourceRhyme: fixture.sourceRhyme,
      spanishVariant: REGIONAL_VARIANT,
      requirements: fixture.requirements,
      draftingPrompt,
      draftOptions,
      draftUsage: draftResult.usage,
      editorialPrompt,
      editorialAssessment,
      editorialUsage: editorResult.usage,
      finalSelectedOutput: finalSelected,
      warnings: [...draftWarnings, ...editorialWarnings],
      timingMs: draftResult.usage.latencyMs + editorResult.usage.latencyMs,
      estimatedModelCostUsd: draftResult.usage.estimatedCostUsd + editorResult.usage.estimatedCostUsd
    });
  }

  const bundle = {
    promptVersion: "multilingual-language-packs-v1",
    runType: "controlled_spanish_evaluation",
    generatedAt: new Date().toISOString(),
    targetLanguage: TARGET_LANGUAGE,
    regionalVariant: REGIONAL_VARIANT,
    model: MODEL,
    reasoningEffort: REASONING_EFFORT,
    automaticRetries: 0,
    maximumEstimatedCostUsd: maximumCost,
    refrainSetup: {
      englishSources: mushroomFixtures.map((fixture) => fixture.source),
      draftingPrompt: directionDraftingPrompt,
      rawDraftOptions: rawDirectionDrafts,
      survivingDrafts: directionDraftValidation.survivors,
      draftRejections: directionDraftValidation.rejections,
      draftingUsage: priorAttemptSummary.drafting,
      resumedFromCompletedDraft: true,
      failedEditorialAttempt: priorAttemptSummary.failedEditorial,
      editorialPrompt: directionEditorialPrompt,
      editorialOptions: directionOptions,
      editorialUsage: directionEditorialResult.usage,
      successfulEditorialRetry: {
        responseId: directionEditorialResult.usage.responseId,
        responseStatus: directionEditorialResult.usage.responseStatus,
        usage: directionEditorialResult.usage
      },
      selectedDirection,
      warnings: [
        ...directionDraftValidation.qualityWarnings,
        ...directionDiagnostics.qualityWarnings
      ]
    },
    fixtures: fixtureResults,
    additionalRunTotals: totalUsage(usage),
    priorInterruptedAttemptTotals: priorAttemptSummary.totals,
    combinedTotals: {
      latencyMs: priorAttemptSummary.totals.latencyMs + totalUsage(usage).latencyMs,
      inputTokens: priorAttemptSummary.totals.inputTokens + totalUsage(usage).inputTokens,
      cachedInputTokens:
        priorAttemptSummary.totals.cachedInputTokens + totalUsage(usage).cachedInputTokens,
      outputTokens: priorAttemptSummary.totals.outputTokens + totalUsage(usage).outputTokens,
      reasoningTokens:
        priorAttemptSummary.totals.reasoningTokens + totalUsage(usage).reasoningTokens,
      estimatedCostUsd:
        priorAttemptSummary.totals.estimatedCostUsd + totalUsage(usage).estimatedCostUsd
    }
  };
  const artifactDirectory = resolve("artifacts", `spanish-evaluation-${Date.now()}`);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    resolve(artifactDirectory, "review-bundle.json"),
    `${JSON.stringify(bundle, null, 2)}\n`
  );
  console.log(JSON.stringify({
    artifactDirectory,
    additionalRunTotals: bundle.additionalRunTotals,
    combinedTotals: bundle.combinedTotals
  }, null, 2));
}

void main();
