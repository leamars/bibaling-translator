import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  translationEvaluationPrompt,
  translationGenerationPrompt,
  type DirectionBrief
} from "../app/api/translation-prompts.ts";
import {
  languageSelectionLabel,
  type TargetLanguage
} from "../app/languages/language-config.ts";
import { MULTILINGUAL_EVALUATION_FIXTURES } from "../tests/fixtures/multilingual-evaluation-fixtures.ts";

export const EVALUATION_LANGUAGES: Array<{ targetLanguage: TargetLanguage; regionalVariant?: string }> = [
  { targetLanguage: "es", regionalVariant: "es-ES" },
  { targetLanguage: "de" },
  { targetLanguage: "it" },
  { targetLanguage: "hr" },
  { targetLanguage: "sr", regionalVariant: "sr-Cyrl" },
  { targetLanguage: "sl" }
];

export type MultilingualEvaluationRecord = {
  fixtureId: string;
  category: string;
  source: string;
  visualContext: string;
  requirements: string[];
  targetLanguage: TargetLanguage;
  regionalVariant?: string;
  languageLabel: string;
  bookForm: string;
  draftingPrompt: string;
  draftingOptions: Array<{ id: string; strategy: string; text: string }>;
  editorialPrompt: string;
  editorialAssessment: Array<{
    sourceCandidateId: string;
    strategy: string;
    text: string;
    fidelityPass: boolean;
    grammarPass: boolean;
    readAloudPass: boolean;
    directionPass: boolean;
    rhymePass: boolean;
  }>;
  selectedFinalOutput: string;
  mode: "mock" | "live";
};

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
    rhymePass: z.boolean()
  })).length(3)
});

function directionFor(fixture: (typeof MULTILINGUAL_EVALUATION_FIXTURES)[number]): DirectionBrief | undefined {
  if (fixture.bookForm !== "refrain_verse") return undefined;
  return {
    name: "Evaluation refrain",
    refrain: fixture.approvedRefrain || "Tra-la-la!",
    approach: "Keep this exact wording wherever the source refrain appears.",
    genderDependency: "None; the language-neutral chant is a consistency anchor."
  };
}

export function buildEvaluationPlan() {
  return EVALUATION_LANGUAGES.flatMap((selection) =>
    MULTILINGUAL_EVALUATION_FIXTURES.map((fixture) => {
      const languageLabel = languageSelectionLabel(selection.targetLanguage, selection.regionalVariant);
      const direction = directionFor(fixture);
      const base = {
        spreadNumber: 1,
        source: fixture.source,
        visualContext: fixture.visualContext,
        priority: fixture.priority,
        freedom: fixture.freedom,
        bookForm: fixture.bookForm,
        sourceRhyme: fixture.sourceRhyme,
        direction,
        targetLanguage: selection.targetLanguage,
        regionalVariant: selection.regionalVariant
      };
      const draftingPrompt = translationGenerationPrompt(base);
      const mockCandidates = Array.from({ length: 6 }, (_, index) => ({
        id: `c0${index + 1}`,
        strategy: `Mock strategy ${index + 1}`,
        text: `[MOCK ${languageLabel}] ${fixture.id} candidate ${index + 1}.`
      }));
      return {
        fixture,
        selection,
        languageLabel,
        base,
        draftingPrompt,
        mockCandidates
      };
    })
  );
}

export async function runMockEvaluation(): Promise<MultilingualEvaluationRecord[]> {
  return buildEvaluationPlan().map(({ fixture, selection, languageLabel, base, draftingPrompt, mockCandidates }) => {
    const editorialPrompt = translationEvaluationPrompt({
      ...base,
      candidatesJson: JSON.stringify(mockCandidates)
    });
    const editorialAssessment = mockCandidates.slice(0, 3).map((candidate) => ({
      sourceCandidateId: candidate.id,
      strategy: candidate.strategy,
      text: candidate.text,
      fidelityPass: true,
      grammarPass: true,
      readAloudPass: true,
      directionPass: true,
      rhymePass: true
    }));
    return {
      fixtureId: fixture.id,
      category: fixture.category,
      source: fixture.source,
      visualContext: fixture.visualContext,
      requirements: fixture.requirements,
      targetLanguage: selection.targetLanguage,
      regionalVariant: selection.regionalVariant,
      languageLabel,
      bookForm: fixture.bookForm,
      draftingPrompt,
      draftingOptions: mockCandidates,
      editorialPrompt,
      editorialAssessment,
      selectedFinalOutput: editorialAssessment[0].text,
      mode: "mock"
    };
  });
}

async function runLiveEvaluation(): Promise<MultilingualEvaluationRecord[]> {
  if (process.env.CONFIRM_MULTILINGUAL_LIVE !== "RUN_MULTILINGUAL_EVALUATION") {
    throw new Error("Live evaluation requires CONFIRM_MULTILINGUAL_LIVE=RUN_MULTILINGUAL_EVALUATION.");
  }
  const [{ controlledResponse }, { openAIClient }] = await Promise.all([
    import("../app/api/openai-control.ts"),
    import("../app/api/generation.ts")
  ]);
  const client = openAIClient();
  if (!client) throw new Error("OPENAI_API_KEY is required for live evaluation.");
  const records: MultilingualEvaluationRecord[] = [];
  for (const plan of buildEvaluationPlan()) {
    const draft = await controlledResponse({
      client,
      requestSignal: AbortSignal.timeout(120_000),
      action: `multilingual-eval.${plan.selection.targetLanguage}.${plan.fixture.id}.draft`,
      model: "gpt-5.6-sol",
      maxOutputTokens: 3_500,
      timeoutMs: 120_000,
      body: {
        model: "gpt-5.6-sol",
        reasoning: { effort: "low" },
        input: plan.draftingPrompt,
        text: { format: { type: "json_schema", name: "multilingual_eval_draft", strict: true, schema: {
          type: "object", additionalProperties: false, properties: { candidates: {
            type: "array", minItems: 6, maxItems: 6, items: { type: "object", additionalProperties: false,
              properties: { id: { type: "string" }, strategy: { type: "string" }, text: { type: "string" } },
              required: ["id", "strategy", "text"] }
          } }, required: ["candidates"]
        } } }
      }
    });
    const candidates = candidateSchema.parse(JSON.parse(draft.response.output_text)).candidates;
    const editorialPrompt = translationEvaluationPrompt({ ...plan.base, candidatesJson: JSON.stringify(candidates) });
    const editorial = await controlledResponse({
      client,
      requestSignal: AbortSignal.timeout(120_000),
      action: `multilingual-eval.${plan.selection.targetLanguage}.${plan.fixture.id}.editor`,
      model: "gpt-5.6-sol",
      maxOutputTokens: 2_500,
      timeoutMs: 120_000,
      body: {
        model: "gpt-5.6-sol",
        reasoning: { effort: "low" },
        input: editorialPrompt,
        text: { format: { type: "json_schema", name: "multilingual_eval_editorial", strict: true, schema: {
          type: "object", additionalProperties: false, properties: { finalists: {
            type: "array", minItems: 3, maxItems: 3, items: { type: "object", additionalProperties: false,
              properties: {
                sourceCandidateId: { type: "string" }, strategy: { type: "string" }, text: { type: "string" },
                fidelityPass: { type: "boolean" }, grammarPass: { type: "boolean" }, readAloudPass: { type: "boolean" },
                directionPass: { type: "boolean" }, rhymePass: { type: "boolean" }
              },
              required: ["sourceCandidateId", "strategy", "text", "fidelityPass", "grammarPass", "readAloudPass", "directionPass", "rhymePass"] }
          } }, required: ["finalists"]
        } } }
      }
    });
    const assessment = editorialSchema.parse(JSON.parse(editorial.response.output_text)).finalists;
    records.push({
      fixtureId: plan.fixture.id, category: plan.fixture.category, source: plan.fixture.source,
      visualContext: plan.fixture.visualContext, requirements: plan.fixture.requirements,
      targetLanguage: plan.selection.targetLanguage, regionalVariant: plan.selection.regionalVariant,
      languageLabel: plan.languageLabel, bookForm: plan.fixture.bookForm,
      draftingPrompt: plan.draftingPrompt, draftingOptions: candidates, editorialPrompt,
      editorialAssessment: assessment, selectedFinalOutput: assessment[0].text, mode: "live"
    });
  }
  return records;
}

async function main() {
  const live = process.argv.includes("--live");
  const records = live ? await runLiveEvaluation() : await runMockEvaluation();
  const directory = resolve("artifacts");
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, `multilingual-evaluation-${live ? "live" : "mock"}.json`);
  await writeFile(output, `${JSON.stringify({
    promptVersion: "multilingual-language-packs-v1",
    generatedAt: new Date().toISOString(),
    mode: live ? "live" : "mock",
    records
  }, null, 2)}\n`);
  console.log(output);
}

if (process.argv[1]?.endsWith("multilingual-evaluation.ts")) {
  void main();
}
