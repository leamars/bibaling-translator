import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import {
  calculateCost,
  controlledResponse,
  pricingFor
} from "../app/api/openai-control.ts";
import {
  leanPageEditorialJsonSchema,
  leanPageEditorialResultSchema,
  resolveLeanPageDecision
} from "../app/api/page-editorial-contract.ts";
import { deterministicViolations } from "../app/api/translation-quality.ts";
import { requiresRhyme } from "../app/api/book-form-contract.ts";
import { GERMAN_EVALUATION_FIXTURES } from "../tests/fixtures/german-evaluation-fixtures.ts";
import {
  PAGE_SEPARATOR,
  meaningfulSharedLines,
  pairedDraftSchema,
  pairedEditorPrompt,
  type NormalizedCandidate
} from "./live-german-evaluation.ts";

const SOURCE_DIRECTORY = resolve("artifacts/german-evaluation-1785517477747");
const SOURCE_DRAFT_RESPONSE = resolve(
  SOURCE_DIRECTORY,
  "1-mush-refrain-consistency-pair-draft-raw-response.json"
);
const ORIGINAL_INCOMPLETE_RESPONSE = resolve(
  SOURCE_DIRECTORY,
  "1-mush-refrain-consistency-pair-editor-raw-response.json"
);
const RETRY_RAW_RESPONSE = resolve(
  SOURCE_DIRECTORY,
  "1-mush-refrain-consistency-pair-editor-retry-3500-raw-response.json"
);
const MODEL = "gpt-5.6-sol";
const OUTPUT_TOKENS = 3_500;
const MAX_INPUT_TOKENS = 13_000;
const AUTHORIZED_MAXIMUM_USD = 0.18;

function responseOutput(response: any, stage: string) {
  if (response.status !== "completed" || !response.output_text?.trim()) {
    throw Object.assign(new Error(`${stage} did not complete.`), {
      code: "OPENAI_RESPONSE_INCOMPLETE",
      status: response.status,
      incompleteReason: response.incomplete_details?.reason || null
    });
  }
  return JSON.parse(response.output_text);
}

function sourceOutput(response: any) {
  const text = response.output
    ?.flatMap((item: any) => item.content || [])
    .find((item: any) => item.type === "output_text")?.text;
  if (!text) throw new Error("The preserved completed drafting response has no output text.");
  return JSON.parse(text);
}

function normalizeDrafts(response: any): NormalizedCandidate[] {
  return pairedDraftSchema.parse(sourceOutput(response)).candidates.map((candidate) => ({
    id: candidate.id,
    strategy: candidate.strategy,
    refrain: candidate.refrain,
    pages: [candidate.page1Text, candidate.page2Text],
    text: `${candidate.page1Text}${PAGE_SEPARATOR}${candidate.page2Text}`
  }));
}

async function main() {
  if (
    !process.argv.includes("--live") ||
    process.env.CONFIRM_GERMAN_EDITOR_RETRY !== "RETRY_REFRAIN_EDITOR_3500"
  ) {
    throw new Error("This call requires --live and CONFIRM_GERMAN_EDITOR_RETRY=RETRY_REFRAIN_EDITOR_3500.");
  }
  const maximumEstimatedCostUsd = calculateCost({
    inputTokens: MAX_INPUT_TOKENS,
    cachedInputTokens: 0,
    outputTokens: OUTPUT_TOKENS
  }, pricingFor(MODEL));
  if (maximumEstimatedCostUsd > AUTHORIZED_MAXIMUM_USD) {
    throw new Error(`Maximum $${maximumEstimatedCostUsd.toFixed(6)} exceeds authorized $${AUTHORIZED_MAXIMUM_USD.toFixed(2)}.`);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required.");
  await mkdir(SOURCE_DIRECTORY, { recursive: true });
  const [savedDraftResponse, originalIncomplete] = await Promise.all([
    readFile(SOURCE_DRAFT_RESPONSE, "utf8").then(JSON.parse),
    readFile(ORIGINAL_INCOMPLETE_RESPONSE, "utf8").then(JSON.parse)
  ]);
  if (originalIncomplete.status !== "incomplete") {
    throw new Error("The preserved original response is not the expected incomplete attempt.");
  }
  const fixture = GERMAN_EVALUATION_FIXTURES.find(
    (candidate) => candidate.id === "mush-refrain-consistency-pair"
  );
  if (!fixture) throw new Error("The approved refrain fixture is missing.");
  const drafts = normalizeDrafts(savedDraftResponse);
  if (drafts.length !== 6) throw new Error("Exactly six saved drafts are required.");
  const prompt = pairedEditorPrompt(fixture, drafts);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const result = await controlledResponse({
      client,
      requestSignal: AbortSignal.timeout(120_000),
      action: "german-evaluation.mush-refrain-consistency-pair.editor-retry-3500",
      model: MODEL,
      maxOutputTokens: OUTPUT_TOKENS,
      timeoutMs: 120_000,
      body: {
        model: MODEL,
        reasoning: { effort: "low" },
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "german_lean_editorial_retry_3500",
            strict: true,
            schema: leanPageEditorialJsonSchema
          }
        }
      }
    });
    await writeFile(RETRY_RAW_RESPONSE, `${JSON.stringify(result.response, null, 2)}\n`);
    const editorial = leanPageEditorialResultSchema.parse(
      responseOutput(result.response, "German refrain editorial retry")
    );
    const decision = resolveLeanPageDecision({
      result: editorial,
      rhymeRequired: requiresRhyme(fixture),
      sourceCandidates: drafts
    });
    if (!decision.ok) throw Object.assign(new Error(decision.error.message), decision.error);
    const deterministicFindings = editorial.finalists.map((finalist) => ({
      candidateId: finalist.sourceCandidateId,
      hardFailures: [
        ...deterministicViolations(finalist.evaluatedText, { targetLanguage: "de" }),
        ...(meaningfulSharedLines(finalist.evaluatedText).length === 0
          ? ["no exact meaningful refrain recurs across both evaluated pages"]
          : [])
      ],
      sharedRefrainLines: meaningfulSharedLines(finalist.evaluatedText)
    }));
    if (deterministicFindings.some((finding) => finding.hardFailures.length)) {
      throw Object.assign(new Error("The retry result failed deterministic refrain consistency."), {
        code: "FINAL_SET_INVALID",
        deterministicFindings
      });
    }
    const selectedIds = new Set(decision.finalists.map((finalist) => finalist.sourceCandidateId));
    const bundle = {
      generatedAt: new Date().toISOString(),
      targetLanguage: "de",
      regionalVariant: "de-DE",
      mode: "live_editor_retry",
      sourceRunDirectory: SOURCE_DIRECTORY,
      originalIncompleteResponse: "1-mush-refrain-consistency-pair-editor-raw-response.json",
      retryResponse: "1-mush-refrain-consistency-pair-editor-retry-3500-raw-response.json",
      results: [{
        fixture,
        privateDrafts: drafts,
        deterministicDraftFindings: JSON.parse(
          await readFile(resolve(SOURCE_DIRECTORY, "1-mush-refrain-consistency-pair-drafts-and-findings.json"), "utf8")
        ).deterministicDraftFindings,
        editorial,
        decision: {
          outcome: decision.outcome,
          candidateIds: [...selectedIds]
        },
        finalDeterministicFindings: deterministicFindings,
        usage: { editorialRetry: result.usage }
      }],
      totals: {
        callCount: 1,
        ...result.usage
      }
    };
    await writeFile(resolve(SOURCE_DIRECTORY, "review-bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
    await writeFile(resolve(SOURCE_DIRECTORY, "human-findings.json"), "{}\n");
    await writeFile(resolve(SOURCE_DIRECTORY, "retry-manifest.json"), `${JSON.stringify({
      status: "completed",
      completedAt: new Date().toISOString(),
      callCount: 1,
      automaticRetries: 0,
      model: MODEL,
      reasoningEffort: "low",
      outputAllowance: OUTPUT_TOKENS,
      maximumEstimatedCostUsd,
      usage: result.usage,
      decision: bundle.results[0].decision,
      deterministicFindings
    }, null, 2)}\n`);
    console.log(JSON.stringify({ directory: SOURCE_DIRECTORY, usage: result.usage, decision: bundle.results[0].decision }, null, 2));
  } catch (error) {
    await writeFile(resolve(SOURCE_DIRECTORY, "retry-failure.json"), `${JSON.stringify({
      failedAt: new Date().toISOString(),
      stoppedWithoutRetry: true,
      error: error instanceof Error ? { ...error, name: error.name, message: error.message } : error
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

void main();
