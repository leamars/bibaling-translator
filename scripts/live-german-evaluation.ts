import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import {
  leanPageEditorialContract,
  translationEvaluationPrompt,
  translationGenerationPrompt
} from "../app/api/translation-prompts.ts";
import {
  leanPageEditorialJsonSchema,
  leanPageEditorialResultSchema,
  resolveLeanPageDecision
} from "../app/api/page-editorial-contract.ts";
import { requiresRhyme } from "../app/api/book-form-contract.ts";
import { deterministicViolations } from "../app/api/translation-quality.ts";
import { languagePromptGuidance } from "../app/languages/prompt-guidance.ts";
import {
  calculateCost,
  controlledResponse,
  pricingFor,
  type UsageRecord
} from "../app/api/openai-control.ts";
import {
  GERMAN_EVALUATION_FIXTURES,
  type GermanEvaluationFixture
} from "../tests/fixtures/german-evaluation-fixtures.ts";

const MODEL = "gpt-5.6-sol";
const REASONING_EFFORT = "low";
const TARGET_LANGUAGE = "de" as const;
const LANGUAGE_TAG = "de-DE";
const REGIONAL_VARIANT = undefined;
const DRAFT_OUTPUT_TOKENS = 3_500;
const EDITOR_OUTPUT_TOKENS = 2_500;
const DRAFT_MAX_INPUT_TOKENS = 8_000;
const EDITOR_MAX_INPUT_TOKENS = 13_000;
const APPROVED_MAXIMUM_COST_USD = 0.855;
const EXPECTED_CALL_COUNT = 6;
export const PAGE_SEPARATOR = "\f";

const standardDraftSchema = z.object({
  candidates: z.array(z.object({
    id: z.string().trim().min(1).max(20),
    strategy: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(4_000)
  })).length(6)
});

export const pairedDraftSchema = z.object({
  candidates: z.array(z.object({
    id: z.string().trim().min(1).max(20),
    strategy: z.string().trim().min(1).max(80),
    refrain: z.string().trim().min(1).max(240),
    page1Text: z.string().trim().min(1).max(2_000),
    page2Text: z.string().trim().min(1).max(2_000)
  })).length(6)
});

const standardDraftJsonSchema = {
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
          id: { type: "string", minLength: 1, maxLength: 20 },
          strategy: { type: "string", minLength: 1, maxLength: 80 },
          text: { type: "string", minLength: 1, maxLength: 4_000 }
        },
        required: ["id", "strategy", "text"]
      }
    }
  },
  required: ["candidates"]
} as const;

const pairedDraftJsonSchema = {
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
          id: { type: "string", minLength: 1, maxLength: 20 },
          strategy: { type: "string", minLength: 1, maxLength: 80 },
          refrain: { type: "string", minLength: 1, maxLength: 240 },
          page1Text: { type: "string", minLength: 1, maxLength: 2_000 },
          page2Text: { type: "string", minLength: 1, maxLength: 2_000 }
        },
        required: ["id", "strategy", "refrain", "page1Text", "page2Text"]
      }
    }
  },
  required: ["candidates"]
} as const;

export type NormalizedCandidate = {
  id: string;
  strategy: string;
  text: string;
  refrain?: string;
  pages?: string[];
};

function maximumEstimatedCost() {
  const pricing = pricingFor(MODEL);
  const draft = calculateCost({
    inputTokens: DRAFT_MAX_INPUT_TOKENS,
    cachedInputTokens: 0,
    outputTokens: DRAFT_OUTPUT_TOKENS
  }, pricing);
  const editor = calculateCost({
    inputTokens: EDITOR_MAX_INPUT_TOKENS,
    cachedInputTokens: 0,
    outputTokens: EDITOR_OUTPUT_TOKENS
  }, pricing);
  return GERMAN_EVALUATION_FIXTURES.length * (draft + editor);
}

function pairedDraftPrompt(fixture: GermanEvaluationFixture) {
  const [first, second] = fixture.pages;
  return `${languagePromptGuidance({ targetLanguage: TARGET_LANGUAGE, regionalVariant: REGIONAL_VARIANT })}

CONTROLLED EVALUATION TASK
Create exactly six private, genuinely different German two-page adaptations. Each candidate must:
- contain one compact German refrain corresponding to “I really love you oh-so-MUSH”;
- use that exact refrain verbatim once in page 1 and once in page 2;
- preserve each page's separate scene, action, address, line order, and picture truth;
- retain natural child-friendly spoken German and convincing source-supported rhyme;
- vary strategy through natural syntax, rhythm, wordplay, and rhyme rather than invented content.

PAGE 1 — CORRECTED ENGLISH
${first.source}

PAGE 1 — VISUAL CONTEXT
${first.visualContext}

PAGE 2 — CORRECTED ENGLISH
${second.source}

PAGE 2 — VISUAL CONTEXT
${second.visualContext}

Return exactly candidates c01–c06 in the required schema. English is permitted only in the short strategy field. refrain, page1Text, and page2Text must contain solely reader-facing German. Do not include page labels, explanations, or alternatives inside those fields.`;
}

export function pairedEditorPrompt(
  fixture: GermanEvaluationFixture,
  candidates: NormalizedCandidate[]
) {
  const [first, second] = fixture.pages;
  return `${languagePromptGuidance({ targetLanguage: TARGET_LANGUAGE, regionalVariant: REGIONAL_VARIANT })}

ROLE
Act as an independent native German children's-book editor. Evaluate the six paired-page adaptations and return exactly three publication-ready paired finalists.

LOCKED BOOK FORM: VERSE WITH A REPEATING REFRAIN
Each finalist covers two pages separated in the private text container by a form-feed character. The exact same meaningful German refrain must recur in both pages. Preserve the separator in originalText and evaluatedText. Do not print a page label.

LOCKED PARENT PRIORITY
Use convincing spoken rhyme and read-aloud rhythm without distorting meaning, German word order, or syntax.

CREATIVE FREEDOM
Sound naturally German while preserving both scenes and their illustration truth.

PAGE 1 — CORRECTED ENGLISH
${first.source}

PAGE 1 — VISUAL CONTEXT
${first.visualContext}

PAGE 2 — CORRECTED ENGLISH
${second.source}

PAGE 2 — VISUAL CONTEXT
${second.visualContext}

PRIVATE CANDIDATES
${JSON.stringify(candidates.map(({ id, strategy, text }) => ({ id, strategy, text })))}

${leanPageEditorialContract({ language: "German", rhymeRequired: true })}`;
}

function standardPromptBase(fixture: GermanEvaluationFixture) {
  const page = fixture.pages[0];
  return {
    spreadNumber: 1,
    source: page.source,
    visualContext: page.visualContext,
    priority: fixture.priority,
    freedom: fixture.freedom,
    bookForm: fixture.bookForm,
    sourceRhyme: fixture.sourceRhyme,
    targetLanguage: TARGET_LANGUAGE,
    regionalVariant: REGIONAL_VARIANT
  } as const;
}

function exactDuplicateKey(text: string) {
  return text.normalize("NFC").toLocaleLowerCase("de-DE").replace(/\s+/gu, " ").trim();
}

function tokenSet(text: string) {
  return new Set(text.toLocaleLowerCase("de-DE").match(/[\p{L}\p{N}]+/gu) || []);
}

function nearDuplicateScore(first: string, second: string) {
  const a = tokenSet(first);
  const b = tokenSet(second);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((token) => b.has(token)).length / union.size;
}

function draftFindings(candidates: NormalizedCandidate[], fixture: GermanEvaluationFixture) {
  const seen = new Set<string>();
  return candidates.map((candidate, index) => {
    const hardFailures = deterministicViolations(candidate.text, { targetLanguage: TARGET_LANGUAGE });
    const key = exactDuplicateKey(candidate.text);
    if (seen.has(key)) hardFailures.push("exact duplicate candidate");
    seen.add(key);
    if (fixture.bookForm === "refrain_verse") {
      if (!candidate.refrain || !candidate.pages?.every((page) => page.includes(candidate.refrain!))) {
        hardFailures.push("declared refrain is not preserved exactly in both pages");
      }
    }
    const qualityWarnings: string[] = [];
    for (let prior = 0; prior < index; prior += 1) {
      if (nearDuplicateScore(candidate.text, candidates[prior].text) >= 0.85) {
        qualityWarnings.push(`high lexical overlap with ${candidates[prior].id}`);
      }
    }
    return { candidateId: candidate.id, hardFailures, qualityWarnings };
  });
}

export function meaningfulSharedLines(text: string) {
  const pages = text.split(PAGE_SEPARATOR);
  if (pages.length !== 2) return [];
  const lines = pages.map((page) => new Set(
    page.split("\n").map((line) => line.trim()).filter((line) => line.length >= 8)
  ));
  return [...lines[0]].filter((line) => lines[1].has(line));
}

function completedOutput(response: any, stage: string) {
  if (response.status !== "completed" || !response.output_text?.trim()) {
    throw Object.assign(new Error(`${stage} did not complete.`), {
      code: "OPENAI_RESPONSE_INCOMPLETE",
      status: response.status,
      incompleteReason: response.incomplete_details?.reason || null
    });
  }
  return JSON.parse(response.output_text);
}

function sumUsage(records: UsageRecord[]) {
  return {
    callCount: records.length,
    latencyMs: records.reduce((sum, item) => sum + item.latencyMs, 0),
    inputTokens: records.reduce((sum, item) => sum + item.inputTokens, 0),
    cachedInputTokens: records.reduce((sum, item) => sum + item.cachedInputTokens, 0),
    outputTokens: records.reduce((sum, item) => sum + item.outputTokens, 0),
    reasoningTokens: records.reduce((sum, item) => sum + item.reasoningTokens, 0),
    estimatedCostUsd: records.reduce((sum, item) => sum + item.estimatedCostUsd, 0)
  };
}

async function main() {
  if (
    !process.argv.includes("--live") ||
    process.env.CONFIRM_GERMAN_LIVE !== "RUN_MINIMAL_GERMAN_EVALUATION"
  ) {
    throw new Error("Live German evaluation requires --live and CONFIRM_GERMAN_LIVE=RUN_MINIMAL_GERMAN_EVALUATION.");
  }
  const estimatedMaximum = maximumEstimatedCost();
  if (estimatedMaximum > APPROVED_MAXIMUM_COST_USD + Number.EPSILON) {
    throw new Error(`Estimated maximum $${estimatedMaximum.toFixed(6)} exceeds approved $${APPROVED_MAXIMUM_COST_USD.toFixed(3)}.`);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for the approved live evaluation.");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const directory = resolve(`artifacts/german-evaluation-${Date.now()}`);
  await mkdir(directory, { recursive: true });
  const usage: UsageRecord[] = [];
  const results: any[] = [];
  await writeFile(resolve(directory, "run-manifest.json"), `${JSON.stringify({
    status: "running",
    model: MODEL,
    reasoningEffort: REASONING_EFFORT,
    targetLanguage: TARGET_LANGUAGE,
    regionalVariant: LANGUAGE_TAG,
    expectedCallCount: EXPECTED_CALL_COUNT,
    automaticRetries: 0,
    draftOutputTokens: DRAFT_OUTPUT_TOKENS,
    editorOutputTokens: EDITOR_OUTPUT_TOKENS,
    maximumEstimatedCostUsd: estimatedMaximum,
    fixtures: GERMAN_EVALUATION_FIXTURES
  }, null, 2)}\n`);

  try {
    for (const [fixtureIndex, fixture] of GERMAN_EVALUATION_FIXTURES.entries()) {
      const paired = fixture.bookForm === "refrain_verse";
      const draftPrompt = paired
        ? pairedDraftPrompt(fixture)
        : translationGenerationPrompt(standardPromptBase(fixture));
      const draftResult = await controlledResponse({
        client,
        requestSignal: AbortSignal.timeout(150_000),
        action: `german-evaluation.${fixture.id}.draft`,
        model: MODEL,
        maxOutputTokens: DRAFT_OUTPUT_TOKENS,
        timeoutMs: 150_000,
        body: {
          model: MODEL,
          reasoning: { effort: REASONING_EFFORT },
          input: draftPrompt,
          text: {
            format: {
              type: "json_schema",
              name: paired ? "german_paired_page_drafts" : "german_page_drafts",
              strict: true,
              schema: paired ? pairedDraftJsonSchema : standardDraftJsonSchema
            }
          }
        }
      });
      usage.push(draftResult.usage);
      await writeFile(
        resolve(directory, `${fixtureIndex + 1}-${fixture.id}-draft-raw-response.json`),
        `${JSON.stringify(draftResult.response, null, 2)}\n`
      );
      const rawDrafts = completedOutput(draftResult.response, `${fixture.id} drafting`);
      const candidates: NormalizedCandidate[] = paired
        ? pairedDraftSchema.parse(rawDrafts).candidates.map((candidate) => ({
            id: candidate.id,
            strategy: candidate.strategy,
            refrain: candidate.refrain,
            pages: [candidate.page1Text, candidate.page2Text],
            text: `${candidate.page1Text}${PAGE_SEPARATOR}${candidate.page2Text}`
          }))
        : standardDraftSchema.parse(rawDrafts).candidates;
      const deterministicDraftFindings = draftFindings(candidates, fixture);
      await writeFile(
        resolve(directory, `${fixtureIndex + 1}-${fixture.id}-drafts-and-findings.json`),
        `${JSON.stringify({ fixtureId: fixture.id, privateDrafts: candidates, deterministicDraftFindings }, null, 2)}\n`
      );
      const survivors = candidates.filter((candidate) =>
        deterministicDraftFindings.find((finding) => finding.candidateId === candidate.id)?.hardFailures.length === 0
      );
      if (survivors.length < 3) {
        throw Object.assign(new Error(`Only ${survivors.length} drafts survived deterministic validation.`), {
          code: "DRAFT_QUALITY_REJECTION",
          deterministicDraftFindings
        });
      }

      const editorPrompt = paired
        ? pairedEditorPrompt(fixture, survivors)
        : translationEvaluationPrompt({
            ...standardPromptBase(fixture),
            candidatesJson: JSON.stringify(survivors)
          });
      const editorResult = await controlledResponse({
        client,
        requestSignal: AbortSignal.timeout(120_000),
        action: `german-evaluation.${fixture.id}.editor`,
        model: MODEL,
        maxOutputTokens: EDITOR_OUTPUT_TOKENS,
        timeoutMs: 120_000,
        body: {
          model: MODEL,
          reasoning: { effort: REASONING_EFFORT },
          input: editorPrompt,
          text: {
            format: {
              type: "json_schema",
              name: "german_lean_editorial_result",
              strict: true,
              schema: leanPageEditorialJsonSchema
            }
          }
        }
      });
      usage.push(editorResult.usage);
      await writeFile(
        resolve(directory, `${fixtureIndex + 1}-${fixture.id}-editor-raw-response.json`),
        `${JSON.stringify(editorResult.response, null, 2)}\n`
      );
      const editorial = leanPageEditorialResultSchema.parse(
        completedOutput(editorResult.response, `${fixture.id} editorial`)
      );
      const rhymeRequired = requiresRhyme(fixture);
      const contractIssues = resolveLeanPageDecision({
        result: editorial,
        rhymeRequired,
        sourceCandidates: survivors
      });
      if (!contractIssues.ok) throw Object.assign(new Error(contractIssues.error.message), contractIssues.error);
      const finalDeterministicFindings = editorial.finalists.map((finalist) => ({
        candidateId: finalist.sourceCandidateId,
        hardFailures: [
          ...deterministicViolations(finalist.evaluatedText, { targetLanguage: TARGET_LANGUAGE }),
          ...(paired && meaningfulSharedLines(finalist.evaluatedText).length === 0
            ? ["no exact meaningful refrain recurs across both evaluated pages"]
            : [])
        ],
        sharedRefrainLines: paired ? meaningfulSharedLines(finalist.evaluatedText) : []
      }));
      if (finalDeterministicFindings.some((finding) => finding.hardFailures.length)) {
        throw Object.assign(new Error("A German editorial finalist failed deterministic validation."), {
          code: "FINAL_SET_INVALID",
          finalDeterministicFindings
        });
      }
      results.push({
        fixture,
        draftPrompt,
        privateDrafts: candidates,
        deterministicDraftFindings,
        survivingCandidateIds: survivors.map((candidate) => candidate.id),
        editorPrompt,
        editorial,
        decision: {
          outcome: contractIssues.outcome,
          candidateIds: contractIssues.finalists.map((finalist) => finalist.sourceCandidateId)
        },
        finalDeterministicFindings,
        usage: {
          drafting: draftResult.usage,
          editorial: editorResult.usage
        }
      });
      await writeFile(resolve(directory, "review-bundle.json"), `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        targetLanguage: TARGET_LANGUAGE,
        regionalVariant: LANGUAGE_TAG,
        mode: "live",
        results,
        totals: sumUsage(usage)
      }, null, 2)}\n`);
    }
    if (usage.length !== EXPECTED_CALL_COUNT) throw new Error(`Expected ${EXPECTED_CALL_COUNT} calls, recorded ${usage.length}.`);
    await writeFile(resolve(directory, "run-manifest.json"), `${JSON.stringify({
      status: "completed",
      completedAt: new Date().toISOString(),
      model: MODEL,
      reasoningEffort: REASONING_EFFORT,
      targetLanguage: TARGET_LANGUAGE,
      regionalVariant: LANGUAGE_TAG,
      actualCallCount: usage.length,
      automaticRetries: 0,
      maximumEstimatedCostUsd: estimatedMaximum,
      totals: sumUsage(usage),
      fixtures: GERMAN_EVALUATION_FIXTURES
    }, null, 2)}\n`);
    await writeFile(resolve(directory, "human-findings.json"), "{}\n");
    console.log(JSON.stringify({ directory, totals: sumUsage(usage) }, null, 2));
  } catch (error) {
    await writeFile(resolve(directory, "failure.json"), `${JSON.stringify({
      failedAt: new Date().toISOString(),
      error: error instanceof Error ? { ...error, name: error.name, message: error.message } : error,
      completedResults: results.map((result) => result.fixture.id),
      usage: sumUsage(usage)
    }, null, 2)}\n`);
    console.error(JSON.stringify({ directory, stoppedWithoutRetry: true }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("live-german-evaluation.ts")) {
  void main();
}
