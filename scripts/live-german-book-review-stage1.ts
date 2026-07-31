import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { calculateCost, controlledResponse, pricingFor } from "../app/api/openai-control.ts";
import { deterministicViolations } from "../app/api/translation-quality.ts";
import { translationGenerationPrompt } from "../app/api/translation-prompts.ts";
import { MULTILINGUAL_EVALUATION_FIXTURES } from "../tests/fixtures/multilingual-evaluation-fixtures.ts";
import { GERMAN_EVALUATION_FIXTURES } from "../tests/fixtures/german-evaluation-fixtures.ts";
import { pairedDraftSchema, PAGE_SEPARATOR } from "./live-german-evaluation.ts";

const MODEL = "gpt-5.6-sol";
const OUTPUT_TOKENS = 3_500;
const MAX_INPUT_TOKENS = 8_000;
const MAXIMUM_AUTHORIZED_COST_USD = 0.145;
const SOURCE_RUN = resolve("artifacts/german-evaluation-1785517477747");
const SOURCE_MUSHROOM_RESPONSE = resolve(
  SOURCE_RUN,
  "1-mush-refrain-consistency-pair-draft-raw-response.json"
);

const candidateSchema = z.object({
  candidates: z.array(z.object({
    id: z.string().trim().min(1).max(20),
    strategy: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(4_000)
  })).length(6)
});

const candidateJsonSchema = {
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

function outputText(response: any, stage: string) {
  if (response.status !== "completed" || !response.output_text?.trim()) {
    throw Object.assign(new Error(`${stage} did not complete.`), {
      code: "OPENAI_RESPONSE_INCOMPLETE",
      status: response.status,
      incompleteReason: response.incomplete_details?.reason || null
    });
  }
  return JSON.parse(response.output_text);
}

function preservedOutput(response: any) {
  const text = response.output
    ?.flatMap((item: any) => item.content || [])
    .find((item: any) => item.type === "output_text")?.text;
  if (!text) throw new Error("The preserved Mushroom drafting response has no output text.");
  return JSON.parse(text);
}

function duplicateKey(text: string) {
  return text.normalize("NFC").toLocaleLowerCase("de-DE").replace(/\s+/gu, " ").trim();
}

function findings(candidates: Array<{ id: string; text: string }>) {
  const seen = new Set<string>();
  return candidates.map((candidate) => {
    const hardFailures = deterministicViolations(candidate.text, { targetLanguage: "de" });
    const key = duplicateKey(candidate.text);
    if (seen.has(key)) hardFailures.push("exact duplicate candidate");
    seen.add(key);
    return { candidateId: candidate.id, hardFailures, qualityWarnings: [] as string[] };
  });
}

async function main() {
  if (
    !process.argv.includes("--live") ||
    process.env.CONFIRM_GERMAN_BOOK_REVIEW_STAGE1 !== "RUN_LLAMA_PAGE1_DRAFT"
  ) {
    throw new Error("Stage 1 requires --live and CONFIRM_GERMAN_BOOK_REVIEW_STAGE1=RUN_LLAMA_PAGE1_DRAFT.");
  }
  const maximumEstimatedCostUsd = calculateCost({
    inputTokens: MAX_INPUT_TOKENS,
    cachedInputTokens: 0,
    outputTokens: OUTPUT_TOKENS
  }, pricingFor(MODEL));
  if (maximumEstimatedCostUsd > MAXIMUM_AUTHORIZED_COST_USD + Number.EPSILON) {
    throw new Error(`Maximum $${maximumEstimatedCostUsd.toFixed(6)} exceeds authorized $${MAXIMUM_AUTHORIZED_COST_USD.toFixed(3)}.`);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required.");

  const llamaFixture = MULTILINGUAL_EVALUATION_FIXTURES.find((fixture) => fixture.id === "llama-bedtime-story");
  const mushroomFixture = GERMAN_EVALUATION_FIXTURES.find((fixture) => fixture.id === "mush-refrain-consistency-pair");
  if (!llamaFixture || !mushroomFixture) throw new Error("The approved source fixtures are missing.");
  const sourceResponse = JSON.parse(await readFile(SOURCE_MUSHROOM_RESPONSE, "utf8"));
  const mushroomCandidates = pairedDraftSchema.parse(preservedOutput(sourceResponse)).candidates.map((candidate) => ({
    id: candidate.id,
    strategy: candidate.strategy,
    text: `${candidate.page1Text}${PAGE_SEPARATOR}${candidate.page2Text}`,
    refrain: candidate.refrain
  }));

  const prompt = translationGenerationPrompt({
    spreadNumber: 1,
    source: llamaFixture.source,
    visualContext: llamaFixture.visualContext,
    priority: llamaFixture.priority,
    freedom: llamaFixture.freedom,
    bookForm: llamaFixture.bookForm,
    sourceRhyme: llamaFixture.sourceRhyme,
    targetLanguage: "de"
  });
  const directory = resolve(`artifacts/german-book-review-stage1-${Date.now()}`);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "run-manifest.json"), `${JSON.stringify({
    status: "running",
    generatedAt: new Date().toISOString(),
    model: MODEL,
    reasoningEffort: "low",
    callCount: 1,
    automaticRetries: 0,
    outputAllowance: OUTPUT_TOKENS,
    maximumEstimatedCostUsd,
    sourceMushroomRun: SOURCE_RUN,
    llamaFixture
  }, null, 2)}\n`);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const result = await controlledResponse({
      client,
      requestSignal: AbortSignal.timeout(150_000),
      action: "german-book-review.llama-page1.draft",
      model: MODEL,
      maxOutputTokens: OUTPUT_TOKENS,
      timeoutMs: 150_000,
      body: {
        model: MODEL,
        reasoning: { effort: "low" },
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "german_book_review_llama_page1_drafts",
            strict: true,
            schema: candidateJsonSchema
          }
        }
      }
    });
    await writeFile(resolve(directory, "llama-page1-draft-raw-response.json"), `${JSON.stringify(result.response, null, 2)}\n`);
    const llamaCandidates = candidateSchema.parse(outputText(result.response, "Llama Page 1 drafting")).candidates;
    const llamaFindings = findings(llamaCandidates);
    if (llamaFindings.some((finding) => finding.hardFailures.length)) {
      throw Object.assign(new Error("Llama Page 1 drafts failed deterministic validation."), {
        code: "DRAFT_QUALITY_REJECTION",
        findings: llamaFindings
      });
    }
    const bundle = {
      generatedAt: new Date().toISOString(),
      targetLanguage: "de",
      regionalVariant: "de-DE",
      fixtures: [
        {
          fixtureId: mushroomFixture.id,
          category: "Book-level refrain and voice across the first two Mushroom spreads",
          sourceBook: mushroomFixture.sourceBook,
          sourceAsset: mushroomFixture.pages[0].sourceAsset,
          sourceAssets: mushroomFixture.pages.map((page) => page.sourceAsset),
          englishSource: mushroomFixture.pages.map((page) => page.source).join(`\n\n${PAGE_SEPARATOR}\n\n`),
          visualContext: mushroomFixture.pages.map((page) => page.visualContext).join("\n\n"),
          bookForm: mushroomFixture.bookForm,
          sourceRhyme: mushroomFixture.sourceRhyme,
          requirements: mushroomFixture.requirements,
          blindCandidates: mushroomCandidates,
          draftOptions: [],
          editorialAssessment: [],
          finalSelectedOutput: ""
        },
        {
          fixtureId: llamaFixture.id,
          category: "Book-level poetic voice on Llama Page 1",
          sourceBook: llamaFixture.sourceBook,
          sourceAsset: llamaFixture.sourceAsset,
          englishSource: llamaFixture.source,
          visualContext: llamaFixture.visualContext,
          bookForm: llamaFixture.bookForm,
          sourceRhyme: llamaFixture.sourceRhyme,
          requirements: llamaFixture.requirements,
          blindCandidates: llamaCandidates,
          draftOptions: [],
          editorialAssessment: [],
          finalSelectedOutput: ""
        }
      ],
      provenance: {
        mushroom: {
          sourceResponse: "../german-evaluation-1785517477747/1-mush-refrain-consistency-pair-draft-raw-response.json",
          reusedWithoutModelCall: true,
          candidateCount: mushroomCandidates.length
        },
        llama: {
          sourceResponse: "llama-page1-draft-raw-response.json",
          deterministicFindings: llamaFindings,
          usage: result.usage
        }
      }
    };
    await writeFile(resolve(directory, "review-bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
    await writeFile(resolve(directory, "human-findings.json"), "{}\n");
    await writeFile(resolve(directory, "run-manifest.json"), `${JSON.stringify({
      status: "completed",
      completedAt: new Date().toISOString(),
      model: MODEL,
      reasoningEffort: "low",
      callCount: 1,
      automaticRetries: 0,
      outputAllowance: OUTPUT_TOKENS,
      maximumEstimatedCostUsd,
      actualUsage: result.usage,
      reviewBundle: "review-bundle.json"
    }, null, 2)}\n`);
    console.log(JSON.stringify({ directory, usage: result.usage }, null, 2));
  } catch (error) {
    await writeFile(resolve(directory, "failure.json"), `${JSON.stringify({
      failedAt: new Date().toISOString(),
      stoppedWithoutRetry: true,
      error: error instanceof Error ? { ...error, name: error.name, message: error.message } : error
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("live-german-book-review-stage1.ts")) void main();
