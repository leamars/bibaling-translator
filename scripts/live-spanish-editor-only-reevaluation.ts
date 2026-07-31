import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import {
  deriveRefrainBudget,
  editorialOptionsSchema,
  validateDirectionEditorialResult
} from "../app/api/direction-pipeline.ts";
import {
  directionsEvaluationPrompt,
  translationEvaluationPrompt,
  type DirectionBrief
} from "../app/api/translation-prompts.ts";
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

const SOURCE_DIRECTORY = resolve("artifacts/spanish-evaluation-1785444427987");
const REVIEW_BUNDLE_PATH = resolve(SOURCE_DIRECTORY, "review-bundle.json");
const HUMAN_REVIEW_PATH = resolve(SOURCE_DIRECTORY, "finalized-human-review.json");
const MODEL = "gpt-5.6-sol";
const REASONING_EFFORT = "low";
const TARGET_LANGUAGE = "es" as const;
const REGIONAL_VARIANT = "es-ES";
const CALL_COUNT = 7;
const MAX_ESTIMATED_COST_USD = 1.005;
const APPROVED_COST_CEILING_USD = 1.01;

const comparativeEditorialSchema = z.object({
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
          "sourceCandidateId",
          "strategy",
          "text",
          "fidelityPass",
          "grammarPass",
          "readAloudPass",
          "directionPass",
          "rhymePass",
          ...comparativeJsonRequired
        ]
      }
    },
    winnerComparisons: winnerComparisonsJsonSchema
  },
  required: ["finalists", "winnerComparisons"]
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
          },
          fidelityPass: { type: "boolean" },
          grammarPass: { type: "boolean" },
          readAloudPass: { type: "boolean" },
          directionPass: { type: "boolean" },
          rhymePass: { type: "boolean" },
          ...comparativeJsonProperties
        },
        required: [
          "sourceCandidateIndex",
          "label",
          "refrain",
          "description",
          "genderDependency",
          "construction",
          "rhymePairs",
          "fidelityPass",
          "grammarPass",
          "readAloudPass",
          "directionPass",
          "rhymePass",
          ...comparativeJsonRequired
        ]
      }
    },
    winnerComparisons: winnerComparisonsJsonSchema
  },
  required: ["options", "winnerComparisons"]
} as const;

type SavedFixture = {
  fixtureId: string;
  category: string;
  sourceBook: string;
  sourceAsset: string;
  englishSource: string;
  visualContext: string;
  bookForm: "prose_story" | "continuous_verse" | "refrain_verse";
  sourceRhyme: "none" | "sustained" | "occasional" | "uncertain";
  requirements: string;
  draftOptions: Array<{ id: string; strategy: string; text: string }>;
  finalSelectedOutput: string;
};

type SavedBundle = {
  refrainSetup: {
    englishSources: string[];
    survivingDrafts: Array<{
      name: string;
      refrain: string;
      approach: string;
      directionIndex: number;
    }>;
    selectedDirection: DirectionBrief;
    editorialOptions: Array<{ refrain: string }>;
  };
  fixtures: SavedFixture[];
};

type HumanConclusion = {
  type: "preferred" | "equivalent" | "none";
  candidateIds: string[];
};

type HumanItem = {
  fixtureId: string;
  humanConclusion: HumanConclusion;
  candidates: Array<{
    candidateId: string;
    exactText: string;
    rating: string | null;
    reasonTags: string[];
    explanation: string;
    preferredRewrite: string;
    lineComments: unknown[];
  }>;
  selectableCandidates: Array<{
    candidateId: string;
    source: string;
    exactText: string;
  }>;
  timestamp: string;
};

type HumanReview = {
  evaluationId: string;
  runId: string;
  exportedAt: string;
  items: HumanItem[];
};

function completedJson(response: {
  status?: string;
  output_text?: string;
  incomplete_details?: { reason?: string } | null;
}, stage: string) {
  if (response.status !== "completed" || !response.output_text?.trim()) {
    throw new Error(
      `${stage} did not complete: ${
        response.incomplete_details?.reason || response.status || "missing output"
      }`
    );
  }
  return JSON.parse(response.output_text);
}

function validateHumanReview(review: HumanReview) {
  if (review.items.length !== 7) throw new Error("Finalized human review must contain seven items.");
  for (const item of review.items) {
    const ids = item.humanConclusion.candidateIds;
    const validShape =
      (item.humanConclusion.type === "preferred" && ids.length === 1) ||
      (item.humanConclusion.type === "equivalent" && ids.length >= 2) ||
      (item.humanConclusion.type === "none" && ids.length === 0);
    const selectable = new Set(item.selectableCandidates.map((candidate) => candidate.candidateId));
    if (!validShape || !ids.every((id) => selectable.has(id)) || !item.timestamp) {
      throw new Error(`Human conclusion for ${item.fixtureId} is incomplete or invalid.`);
    }
  }
}

function sumUsage(records: UsageRecord[]) {
  return {
    callCount: records.length,
    latencyMs: records.reduce((sum, record) => sum + record.latencyMs, 0),
    inputTokens: records.reduce((sum, record) => sum + record.inputTokens, 0),
    cachedInputTokens: records.reduce((sum, record) => sum + record.cachedInputTokens, 0),
    outputTokens: records.reduce((sum, record) => sum + record.outputTokens, 0),
    reasoningTokens: records.reduce((sum, record) => sum + record.reasoningTokens, 0),
    estimatedCostUsd: records.reduce((sum, record) => sum + record.estimatedCostUsd, 0)
  };
}

function humanTexts(item: HumanItem) {
  const byId = new Map(
    item.selectableCandidates.map((candidate) => [candidate.candidateId, candidate.exactText])
  );
  return item.humanConclusion.candidateIds.map((id) => ({
    candidateId: id,
    exactText: byId.get(id) || ""
  }));
}

function conclusionAgreement(
  human: HumanItem,
  recommendedText: string,
  recommendedSourceCandidateId?: string
) {
  if (human.humanConclusion.type === "none") return false;
  return humanTexts(human).some((candidate) =>
    candidate.exactText === recommendedText ||
    candidate.candidateId === recommendedSourceCandidateId
  );
}

async function main() {
  if (
    !process.argv.includes("--live") ||
    process.env.CONFIRM_SPANISH_EDITOR_ONLY !== "RUN_SEVEN_EDITORIAL_CALLS"
  ) {
    throw new Error(
      "This controlled run requires --live and CONFIRM_SPANISH_EDITOR_ONLY=RUN_SEVEN_EDITORIAL_CALLS."
    );
  }
  if (MAX_ESTIMATED_COST_USD > APPROVED_COST_CEILING_USD) {
    throw new Error("Maximum estimated cost exceeds the explicitly approved $1.01 ceiling.");
  }
  const pricing = pricingFor(MODEL);
  const calculatedMaximum =
    calculateCost(
      { inputTokens: 12_000, cachedInputTokens: 0, outputTokens: 3_500 },
      pricing
    ) +
    6 *
      calculateCost(
        { inputTokens: 13_000, cachedInputTokens: 0, outputTokens: 2_500 },
        pricing
      );
  if (Math.abs(calculatedMaximum - MAX_ESTIMATED_COST_USD) > 0.000001) {
    throw new Error(`Cost preflight changed unexpectedly: $${calculatedMaximum.toFixed(6)}.`);
  }

  const [savedBundle, humanReview] = await Promise.all([
    readFile(REVIEW_BUNDLE_PATH, "utf8").then(
      (value) => JSON.parse(value) as SavedBundle
    ),
    readFile(HUMAN_REVIEW_PATH, "utf8").then(
      (value) => JSON.parse(value) as HumanReview
    )
  ]);
  validateHumanReview(humanReview);
  if (savedBundle.fixtures.length !== 6) {
    throw new Error("Saved evaluation bundle must contain exactly six fixtures.");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_actual_key_here") {
    throw new Error("OPENAI_API_KEY is required.");
  }
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const { controlledResponse } = await import("../app/api/openai-control.ts");
  const outputDirectory = resolve(
    "artifacts",
    `spanish-editor-only-reevaluation-${Date.now()}`
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "run-manifest.json"),
    `${JSON.stringify(
      {
        runType: "spanish_editor_only_reevaluation",
        startedAt: new Date().toISOString(),
        sourceDirectory: SOURCE_DIRECTORY,
        humanReviewPath: HUMAN_REVIEW_PATH,
        model: MODEL,
        reasoningEffort: REASONING_EFFORT,
        automaticRetries: 0,
        plannedCallCount: CALL_COUNT,
        maximumEstimatedCostUsd: calculatedMaximum,
        approvedCostCeilingUsd: APPROVED_COST_CEILING_USD
      },
      null,
      2
    )}\n`
  );

  const usage: UsageRecord[] = [];
  const results: unknown[] = [];
  const humanByFixture = new Map(
    humanReview.items.map((item) => [item.fixtureId, item])
  );

  try {
    const mushroomFixtures = savedBundle.fixtures.filter(
      (fixture) => fixture.sourceBook === "I Love You So Mush"
    );
    const refrainBudget = deriveRefrainBudget(savedBundle.refrainSetup.englishSources);
    const directionPrompt = directionsEvaluationPrompt({
      texts: savedBundle.refrainSetup.englishSources,
      visualContexts: mushroomFixtures.map((fixture) => fixture.visualContext),
      priority: "rhythm",
      freedom: "natural",
      targetLanguage: TARGET_LANGUAGE,
      regionalVariant: REGIONAL_VARIANT,
      refrainBudget,
      directionsJson: JSON.stringify(savedBundle.refrainSetup.survivingDrafts)
    });
    const directionResult = await controlledResponse({
      client,
      requestSignal: AbortSignal.timeout(90_000),
      action: "spanish-reevaluation.refrain.editor",
      model: MODEL,
      maxOutputTokens: 3_500,
      timeoutMs: 90_000,
      body: {
        model: MODEL,
        reasoning: { effort: REASONING_EFFORT },
        input: directionPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "spanish_refrain_comparative_reevaluation",
            strict: true,
            schema: directionEditorialJsonSchema
          }
        }
      }
    });
    usage.push(directionResult.usage);
    await writeFile(
      resolve(outputDirectory, "01-refrain-raw-response.json"),
      `${JSON.stringify(directionResult.response, null, 2)}\n`
    );
    const parsedDirection = editorialOptionsSchema.parse(
      completedJson(directionResult.response, "Refrain editorial reevaluation")
    );
    const directionDiagnostics = validateDirectionEditorialResult(
      parsedDirection,
      refrainBudget,
      true,
      savedBundle.refrainSetup.survivingDrafts.length,
      TARGET_LANGUAGE
    );
    const directionSelection = selectRecommendedFinalist({
      finalists: parsedDirection.options,
      winnerComparisons: parsedDirection.winnerComparisons,
      rhymeRequired: true
    });
    const directionWinner = directionSelection.ok
      ? directionSelection.finalist
      : null;
    const directionHuman = humanByFixture.get("refrain-lab");
    if (!directionHuman) throw new Error("Finalized refrain review is missing.");
    results.push({
      fixtureId: "refrain-lab",
      previousAutomaticSelection: savedBundle.refrainSetup.selectedDirection.refrain,
      savedDrafts: savedBundle.refrainSetup.survivingDrafts,
      prompt: directionPrompt,
      finalists: parsedDirection.options,
      winnerComparisons: parsedDirection.winnerComparisons,
      selection: directionSelection,
      hardFailures: directionDiagnostics.hardFailures,
      advisoryWarnings: directionDiagnostics.qualityWarnings,
      humanConclusion: directionHuman.humanConclusion,
      humanConclusionTexts: humanTexts(directionHuman),
      humanCandidateReviews: directionHuman.candidates,
      agreesWithHuman: directionWinner
        ? conclusionAgreement(directionHuman, directionWinner.refrain)
        : false,
      usage: directionResult.usage
    });

    for (const [index, fixture] of savedBundle.fixtures.entries()) {
      const approvedFixture = MULTILINGUAL_EVALUATION_FIXTURES.find(
        (candidate) => candidate.id === fixture.fixtureId
      );
      if (!approvedFixture) {
        throw new Error(`Approved fixture definition is missing ${fixture.fixtureId}.`);
      }
      const direction =
        fixture.bookForm === "refrain_verse"
          ? savedBundle.refrainSetup.selectedDirection
          : undefined;
      const promptBase = {
        spreadNumber: 1,
        source: fixture.englishSource,
        visualContext: fixture.visualContext,
        priority: approvedFixture.priority,
        freedom: approvedFixture.freedom,
        bookForm: fixture.bookForm,
        sourceRhyme: fixture.sourceRhyme,
        direction,
        targetLanguage: TARGET_LANGUAGE,
        regionalVariant: REGIONAL_VARIANT
      };
      const editorialPrompt = translationEvaluationPrompt({
        ...promptBase,
        candidatesJson: JSON.stringify(fixture.draftOptions)
      });
      const editorResult = await controlledResponse({
        client,
        requestSignal: AbortSignal.timeout(120_000),
        action: `spanish-reevaluation.${fixture.fixtureId}.editor`,
        model: MODEL,
        maxOutputTokens: 2_500,
        timeoutMs: 120_000,
        body: {
          model: MODEL,
          reasoning: { effort: REASONING_EFFORT },
          input: editorialPrompt,
          text: {
            format: {
              type: "json_schema",
              name: "spanish_page_comparative_reevaluation",
              strict: true,
              schema: translationEditorialJsonSchema
            }
          }
        }
      });
      usage.push(editorResult.usage);
      await writeFile(
        resolve(
          outputDirectory,
          `${String(index + 2).padStart(2, "0")}-${fixture.fixtureId}-raw-response.json`
        ),
        `${JSON.stringify(editorResult.response, null, 2)}\n`
      );
      const parsed = comparativeEditorialSchema.parse(
        completedJson(editorResult.response, `${fixture.fixtureId} editorial reevaluation`)
      );
      const rhymeRequired = requiresRhyme({
        bookForm: fixture.bookForm,
        sourceRhyme: fixture.sourceRhyme,
        priority: promptBase.priority
      });
      const selection = selectRecommendedFinalist({
        finalists: parsed.finalists,
        winnerComparisons: parsed.winnerComparisons,
        rhymeRequired
      });
      const winner = selection.ok ? selection.finalist : null;
      const human = humanByFixture.get(fixture.fixtureId);
      if (!human) throw new Error(`Finalized human review is missing ${fixture.fixtureId}.`);
      results.push({
        fixtureId: fixture.fixtureId,
        category: fixture.category,
        sourceBook: fixture.sourceBook,
        sourceAsset: fixture.sourceAsset,
        englishSource: fixture.englishSource,
        visualContext: fixture.visualContext,
        bookForm: fixture.bookForm,
        sourceRhyme: fixture.sourceRhyme,
        spanishVariant: REGIONAL_VARIANT,
        previousAutomaticSelection:
          fixture.finalSelectedOutput,
        savedDrafts: fixture.draftOptions,
        prompt: editorialPrompt,
        finalists: parsed.finalists,
        winnerComparisons: parsed.winnerComparisons,
        selection,
        hardFailures: selection.ok ? [] : selection.error.issues,
        advisoryWarnings: [],
        humanConclusion: human.humanConclusion,
        humanConclusionTexts: humanTexts(human),
        humanCandidateReviews: human.candidates,
        agreesWithHuman: winner
          ? conclusionAgreement(human, winner.text, winner.sourceCandidateId)
          : false,
        usage: editorResult.usage
      });
    }

    if (usage.length !== CALL_COUNT) {
      throw new Error(`Expected exactly ${CALL_COUNT} calls, recorded ${usage.length}.`);
    }
    const completedAt = new Date().toISOString();
    const bundle = {
      runType: "spanish_editor_only_reevaluation",
      completedAt,
      sourceDirectory: SOURCE_DIRECTORY,
      preservedHumanReview: {
        path: HUMAN_REVIEW_PATH,
        evaluationId: humanReview.evaluationId,
        runId: humanReview.runId,
        exportedAt: humanReview.exportedAt
      },
      targetLanguage: TARGET_LANGUAGE,
      regionalVariant: REGIONAL_VARIANT,
      model: MODEL,
      reasoningEffort: REASONING_EFFORT,
      automaticRetries: 0,
      plannedCallCount: CALL_COUNT,
      actualCallCount: usage.length,
      maximumEstimatedCostUsd: calculatedMaximum,
      approvedCostCeilingUsd: APPROVED_COST_CEILING_USD,
      totals: sumUsage(usage),
      results
    };
    await writeFile(
      resolve(outputDirectory, "reevaluation-bundle.json"),
      `${JSON.stringify(bundle, null, 2)}\n`
    );
    await writeFile(
      resolve(outputDirectory, "run-manifest.json"),
      `${JSON.stringify(
        {
          runType: bundle.runType,
          status: "completed",
          startedAt: JSON.parse(
            await readFile(resolve(outputDirectory, "run-manifest.json"), "utf8")
          ).startedAt,
          completedAt,
          sourceDirectory: SOURCE_DIRECTORY,
          humanReviewPath: HUMAN_REVIEW_PATH,
          model: MODEL,
          reasoningEffort: REASONING_EFFORT,
          automaticRetries: 0,
          plannedCallCount: CALL_COUNT,
          actualCallCount: usage.length,
          maximumEstimatedCostUsd: calculatedMaximum,
          approvedCostCeilingUsd: APPROVED_COST_CEILING_USD,
          totals: bundle.totals
        },
        null,
        2
      )}\n`
    );
    console.log(
      JSON.stringify(
        { outputDirectory, status: "completed", totals: bundle.totals },
        null,
        2
      )
    );
  } catch (error) {
    const failure = {
      status: "failed",
      failedAt: new Date().toISOString(),
      completedCallCount: usage.length,
      automaticRetries: 0,
      totals: sumUsage(usage),
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: "UnknownError", message: String(error) }
    };
    await writeFile(
      resolve(outputDirectory, "failure.json"),
      `${JSON.stringify(failure, null, 2)}\n`
    );
    console.error(JSON.stringify({ outputDirectory, ...failure }, null, 2));
    process.exitCode = 1;
  }
}

void main();
