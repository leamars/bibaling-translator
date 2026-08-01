import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import OpenAI from "openai";
import { z } from "zod";
import { calculateCost, controlledResponse, pricingFor, type UsageRecord } from "../app/api/openai-control.ts";
import { languagePromptGuidance } from "../app/languages/prompt-guidance.ts";
import { MULTILINGUAL_EVALUATION_FIXTURES } from "../tests/fixtures/multilingual-evaluation-fixtures.ts";

const MODEL = "gpt-5.6-sol";
const REASONING_EFFORT = "low";
const MAX_INPUT_TOKENS = 8_000;
const MAX_OUTPUT_TOKENS = 3_500;
const MAX_CALLS = 8;
const MAXIMUM_AUTHORIZED_COST_USD = 1.16;
const ITALIAN_DRAFT_OUTPUT_TOKENS = 5_500;
const ITALIAN_DRAFT_INPUT_TOKENS = 790;
const ITALIAN_EDITOR_INPUT_CEILING = 2_300;
const CROATIAN_MEASURED_EDITOR_INPUT_TOKENS = 2_231;
const ITALIAN_MAXIMUM_AUTHORIZED_COST_USD = 0.28545;
const CROATIAN_DRAFTS = resolve("artifacts/priority-language-sense-check-1785589814271/parsed/croatian-drafts.json");
const GERMAN_DRAFTS = resolve("artifacts/german-mushroom-draft-diagnostic-1785543046304/raw-output-text.json");
const SPANISH_BUNDLE = resolve("artifacts/spanish-evaluation-1785444427987/review-bundle.json");

export const LANGUAGE_RUNS = [
  { key: "german", targetLanguage: "de" as const, label: "German", draft: false, saved: "german" as const },
  { key: "spanish-spain", targetLanguage: "es" as const, regionalVariant: "es-ES", label: "Spanish — Spain", draft: false, saved: "spanish" as const },
  { key: "italian", targetLanguage: "it" as const, label: "Italian", draft: true },
  { key: "croatian", targetLanguage: "hr" as const, label: "Croatian", draft: true },
  { key: "serbian-cyrillic", targetLanguage: "sr" as const, regionalVariant: "sr-Cyrl", label: "Serbian — Cyrillic", draft: true }
] as const;

const rhymePairSchema = z.object({
  page: z.union([z.literal(1), z.literal(2)]),
  words: z.tuple([z.string().trim().min(1).max(80), z.string().trim().min(1).max(80)]),
  valid: z.boolean(),
  problem: z.string().max(180)
});

export const pairedDraftSchema = z.object({
  candidates: z.array(z.object({
    id: z.string().regex(/^c0[1-6]$/u),
    strategy: z.string().trim().min(1).max(80),
    page1Text: z.string().trim().min(1).max(2_000),
    page2Text: z.string().trim().min(1).max(2_000),
    refrainPage1: z.string().trim().min(1).max(320),
    refrainPage2: z.string().trim().min(1).max(320),
    rhymePairs: z.array(z.object({
      page: z.union([z.literal(1), z.literal(2)]),
      words: z.tuple([z.string().trim().min(1).max(80), z.string().trim().min(1).max(80)])
    })).length(4)
  })).length(6)
});

export const editorialSchema = z.object({
  finalists: z.array(z.object({
    sourceCandidateId: z.string().trim().min(1).max(20),
    page1Text: z.string().trim().min(1).max(2_000),
    page2Text: z.string().trim().min(1).max(2_000),
    refrainPage1: z.string().trim().min(1).max(320),
    refrainPage2: z.string().trim().min(1).max(320),
    rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    recommendedFinalist: z.boolean(),
    naturalnessPass: z.boolean(),
    fidelityPass: z.boolean(),
    readAloudPass: z.boolean(),
    rhymePass: z.boolean(),
    refrainConsistencyPass: z.boolean(),
    rhymePairs: z.array(rhymePairSchema).length(4),
    strength: z.string().trim().min(1).max(300),
    weakness: z.string().trim().min(1).max(300),
    qualityNote: z.string().trim().min(1).max(300)
  })).length(3)
});

const pairedDraftJsonSchema = {
  type: "object", additionalProperties: false,
  properties: { candidates: { type: "array", minItems: 6, maxItems: 6, items: {
    type: "object", additionalProperties: false,
    properties: {
      id: { type: "string", pattern: "^c0[1-6]$" }, strategy: { type: "string", minLength: 1, maxLength: 80 },
      page1Text: { type: "string", minLength: 1, maxLength: 2_000 }, page2Text: { type: "string", minLength: 1, maxLength: 2_000 },
      refrainPage1: { type: "string", minLength: 1, maxLength: 320 }, refrainPage2: { type: "string", minLength: 1, maxLength: 320 },
      rhymePairs: { type: "array", minItems: 4, maxItems: 4, items: { type: "object", additionalProperties: false,
        properties: { page: { type: "integer", enum: [1, 2] }, words: { type: "array", minItems: 2, maxItems: 2, items: { type: "string", minLength: 1, maxLength: 80 } } },
        required: ["page", "words"] } }
    }, required: ["id", "strategy", "page1Text", "page2Text", "refrainPage1", "refrainPage2", "rhymePairs"]
  } } }, required: ["candidates"]
} as const;

const editorialJsonSchema = {
  type: "object", additionalProperties: false,
  properties: { finalists: { type: "array", minItems: 3, maxItems: 3, items: {
    type: "object", additionalProperties: false,
    properties: {
      sourceCandidateId: { type: "string", minLength: 1, maxLength: 20 },
      page1Text: { type: "string", minLength: 1, maxLength: 2_000 }, page2Text: { type: "string", minLength: 1, maxLength: 2_000 },
      refrainPage1: { type: "string", minLength: 1, maxLength: 320 }, refrainPage2: { type: "string", minLength: 1, maxLength: 320 },
      rank: { type: "integer", enum: [1, 2, 3] }, recommendedFinalist: { type: "boolean" },
      naturalnessPass: { type: "boolean" }, fidelityPass: { type: "boolean" }, readAloudPass: { type: "boolean" },
      rhymePass: { type: "boolean" }, refrainConsistencyPass: { type: "boolean" },
      rhymePairs: { type: "array", minItems: 4, maxItems: 4, items: { type: "object", additionalProperties: false,
        properties: { page: { type: "integer", enum: [1, 2] }, words: { type: "array", minItems: 2, maxItems: 2, items: { type: "string", minLength: 1, maxLength: 80 } }, valid: { type: "boolean" }, problem: { type: "string", maxLength: 180 } },
        required: ["page", "words", "valid", "problem"] } },
      strength: { type: "string", minLength: 1, maxLength: 300 }, weakness: { type: "string", minLength: 1, maxLength: 300 }, qualityNote: { type: "string", minLength: 1, maxLength: 300 }
    }, required: ["sourceCandidateId", "page1Text", "page2Text", "refrainPage1", "refrainPage2", "rank", "recommendedFinalist", "naturalnessPass", "fidelityPass", "readAloudPass", "rhymePass", "refrainConsistencyPass", "rhymePairs", "strength", "weakness", "qualityNote"]
  } } }, required: ["finalists"]
} as const;

function sourcePair() {
  const page1 = MULTILINGUAL_EVALUATION_FIXTURES.find((item) => item.id === "mush-watch-over");
  const page2 = MULTILINGUAL_EVALUATION_FIXTURES.find((item) => item.id === "mush-many-hands");
  if (!page1 || !page2) throw new Error("Mushroom comparison fixture is missing.");
  return { page1, page2 };
}

export function maximumEstimatedCost() {
  const pricing = pricingFor(MODEL);
  const perCall = calculateCost({ inputTokens: MAX_INPUT_TOKENS, cachedInputTokens: 0, outputTokens: MAX_OUTPUT_TOKENS }, pricing);
  return { perCall, total: perCall * MAX_CALLS };
}

export function italianMaximumEstimatedCost() {
  const pricing = pricingFor(MODEL);
  const draft = calculateCost({ inputTokens: ITALIAN_DRAFT_INPUT_TOKENS, cachedInputTokens: 0, outputTokens: ITALIAN_DRAFT_OUTPUT_TOKENS }, pricing);
  const editor = calculateCost({ inputTokens: ITALIAN_EDITOR_INPUT_CEILING, cachedInputTokens: 0, outputTokens: MAX_OUTPUT_TOKENS }, pricing);
  return { draft, editor, total: draft + editor };
}

function localTokenCount(value: string) {
  const result = spawnSync("python3", ["-c", "import sys,tiktoken; print(len(tiktoken.get_encoding('o200k_base').encode(sys.stdin.read())))"], {
    input: value,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(`Unable to count prompt tokens: ${result.stderr}`);
  const count = Number(result.stdout.trim());
  if (!Number.isFinite(count)) throw new Error("Tokenizer returned an invalid count.");
  return count;
}

async function measuredEditorInputEstimate(italianPrompt: string) {
  const croatianRun = LANGUAGE_RUNS.find((run) => run.key === "croatian")!;
  const croatianCandidates = pairedDraftSchema.shape.candidates.parse(JSON.parse(await readFile(CROATIAN_DRAFTS, "utf8")));
  const croatianPrompt = editorPrompt(croatianRun, croatianCandidates);
  return CROATIAN_MEASURED_EDITOR_INPUT_TOKENS + localTokenCount(italianPrompt) - localTokenCount(croatianPrompt);
}

function ensurePromptBudget(prompt: string) {
  const conservativeEstimate = Math.ceil(prompt.length / 3);
  if (conservativeEstimate > MAX_INPUT_TOKENS) throw new Error(`Prompt estimate ${conservativeEstimate} exceeds ${MAX_INPUT_TOKENS}.`);
}

export function draftingPrompt(run: typeof LANGUAGE_RUNS[number]) {
  const { page1, page2 } = sourcePair();
  return `${languagePromptGuidance({ targetLanguage: run.targetLanguage, regionalVariant: "regionalVariant" in run ? run.regionalVariant : undefined })}

CONTROLLED TWO-PAGE PRODUCTION-EQUIVALENT EVALUATION
Create exactly six genuinely different private translations of these two consecutive pages.

LOCKED FORM AND PRIORITY
- Verse with a repeating refrain; sustained spoken rhyme and read-aloud rhythm are required.
- Each page must be exactly four reader-facing lines.
- Each page must contain two clearly audible spoken end-rhyme pairs.
- Preserve one recognizable refrain construction across pages; change only grammar required by singular/plural address.
- Preserve the mushroom-speaker wordplay naturally. Never translate “MUSH” mechanically.
- Natural native phrasing, child-friendly rhythm, source meaning, and picture truth all remain mandatory.
- Do not invent unsupported colors, actions, settings, relationships, speed, flight, or emotional claims.
- Declare the exact four rhyme pairs, two for each page. Shared spelling alone is not rhyme.

PAGE 1 — ENGLISH
${page1.source}

PAGE 1 — PICTURE
${page1.visualContext}

PAGE 2 — ENGLISH
${page2.source}

PAGE 2 — PICTURE
${page2.visualContext}

Return only the strict schema. Book text and declared rhyme words must use the selected target language and script.`;
}

export function editorPrompt(run: typeof LANGUAGE_RUNS[number], candidates: z.infer<typeof pairedDraftSchema>["candidates"]) {
  const { page1, page2 } = sourcePair();
  return `${languagePromptGuidance({ targetLanguage: run.targetLanguage, regionalVariant: "regionalVariant" in run ? run.regionalVariant : undefined })}

ROLE
Act as an independent native children's-book verse editor. Evaluate and, where necessary, tightly repair the supplied private candidates. Return exactly three parent-facing finalists and recommend the uniquely strongest one.

LOCKED SOURCE
PAGE 1
${page1.source}
PICTURE: ${page1.visualContext}

PAGE 2
${page2.source}
PICTURE: ${page2.visualContext}

QUALITY CONTRACT
- Preserve natural native phrasing, genuine spoken rhyme, child-friendly cadence, source/picture fidelity, and one consistent refrain construction.
- Pronounce each rhyme pair in its complete line. Do not count spelling, grammatical endings, repeated words, or same-root echoes as sufficient rhyme.
- Reject or repair unsupported invention, literal English syntax, forced inversion, filler, and rhyme-driven wording.
- Preserve person, number, page order, watching-over relationship, linked hands, spinning, lifting, and mushroom-speaker wordplay.
- Return exactly three complete two-page finalists, unique ranks 1–3, and exactly one recommendedFinalist at rank 1.
- Every finalist must be independently readable; do not place private analysis inside book text.
- Keep strength, weakness, and qualityNote concise and specific.

PRIVATE CANDIDATES
${JSON.stringify(candidates)}

Return only the strict schema.`;
}

function validateEditorial(result: z.infer<typeof editorialSchema>) {
  const ranks = result.finalists.map((item) => item.rank);
  if (new Set(ranks).size !== 3 || ![1, 2, 3].every((rank) => ranks.includes(rank as 1 | 2 | 3))) throw new Error("Ranks must be unique 1–3.");
  const recommendations = result.finalists.filter((item) => item.recommendedFinalist);
  if (recommendations.length !== 1 || recommendations[0].rank !== 1) throw new Error("Exactly one rank-1 recommendation is required.");
  for (const finalist of result.finalists) {
    for (const pair of finalist.rhymePairs) {
      if (pair.valid && pair.problem.trim()) throw new Error("Valid rhyme pairs must not contain a problem.");
      if (!pair.valid && !pair.problem.trim()) throw new Error("Invalid rhyme pairs require a problem.");
    }
  }
}

async function savedGermanCandidates() {
  const parsed = JSON.parse(await readFile(GERMAN_DRAFTS, "utf8"));
  const normalized = {
    candidates: parsed.candidates.map((candidate: any) => ({
      ...candidate,
      rhymePairs: candidate.rhymePairs.map((pair: any) => ({
        page: pair.page,
        words: [pair.wordA, pair.wordB]
      }))
    }))
  };
  const candidates = pairedDraftSchema.parse(normalized).candidates.filter((candidate) => ["c03", "c04", "c05", "c06"].includes(candidate.id));
  if (candidates.length !== 4) throw new Error("Expected independent German c03–c06 drafts.");
  return candidates;
}

async function savedSpanishCandidates() {
  const bundle = JSON.parse(await readFile(SPANISH_BUNDLE, "utf8"));
  const first = bundle.fixtures.find((item: any) => item.fixtureId === "mush-watch-over");
  const second = bundle.fixtures.find((item: any) => item.fixtureId === "mush-many-hands");
  const refrain = bundle.refrainSetup.selectedDirection.refrain;
  if (!first || !second || !refrain) throw new Error("Saved Spanish paired inputs are incomplete.");
  return first.draftOptions.map((candidate: any) => {
    const paired = second.draftOptions.find((item: any) => item.id === candidate.id);
    if (!paired) throw new Error(`Missing Spanish pair ${candidate.id}.`);
    return {
      id: candidate.id, strategy: `${candidate.strategy} / ${paired.strategy}`.slice(0, 80),
      page1Text: candidate.text, page2Text: paired.text, refrainPage1: refrain, refrainPage2: refrain,
      rhymePairs: [
        { page: 1 as const, words: ["editor", "must identify"] as [string, string] },
        { page: 1 as const, words: ["editor", "must identify"] as [string, string] },
        { page: 2 as const, words: ["editor", "must identify"] as [string, string] },
        { page: 2 as const, words: ["editor", "must identify"] as [string, string] }
      ]
    };
  });
}

const cyrillicToLatinMap: Record<string, string> = {
  А:"A",Б:"B",В:"V",Г:"G",Д:"D",Ђ:"Đ",Е:"E",Ж:"Ž",З:"Z",И:"I",Ј:"J",К:"K",Л:"L",Љ:"Lj",М:"M",Н:"N",Њ:"Nj",О:"O",П:"P",Р:"R",С:"S",Т:"T",Ћ:"Ć",У:"U",Ф:"F",Х:"H",Ц:"C",Ч:"Č",Џ:"Dž",Ш:"Š",
  а:"a",б:"b",в:"v",г:"g",д:"d",ђ:"đ",е:"e",ж:"ž",з:"z",и:"i",ј:"j",к:"k",л:"l",љ:"lj",м:"m",н:"n",њ:"nj",о:"o",п:"p",р:"r",с:"s",т:"t",ћ:"ć",у:"u",ф:"f",х:"h",ц:"c",ч:"č",џ:"dž",ш:"š"
};

export function serbianCyrillicToLatin(value: string) {
  return [...value].map((character) => cyrillicToLatinMap[character] ?? character).join("");
}

function usageTotals(records: UsageRecord[]) {
  return records.reduce((total, item) => ({
    calls: total.calls + 1, latencyMs: total.latencyMs + item.latencyMs,
    inputTokens: total.inputTokens + item.inputTokens, cachedInputTokens: total.cachedInputTokens + item.cachedInputTokens,
    outputTokens: total.outputTokens + item.outputTokens, reasoningTokens: total.reasoningTokens + item.reasoningTokens,
    estimatedCostUsd: total.estimatedCostUsd + item.estimatedCostUsd
  }), { calls: 0, latencyMs: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCostUsd: 0 });
}

function reviewMarkdown(label: string, result: z.infer<typeof editorialSchema>, source: ReturnType<typeof sourcePair>) {
  const finalists = [...result.finalists].sort((a, b) => a.rank - b.rank);
  return `# ${label} — human sense check

## English source

### Page 1

${source.page1.source}

### Page 2

${source.page2.source}

${finalists.map((item, index) => `## Finalist ${index + 1}${item.recommendedFinalist ? " — editor recommendation" : ""}

### Page 1

${item.page1Text}

### Page 2

${item.page2Text}

**Declared rhyme pairs:** ${item.rhymePairs.map((pair) => `${pair.words[0]} / ${pair.words[1]} (${pair.valid ? "valid" : `invalid: ${pair.problem}`})`).join("; ")}

**Strength:** ${item.strength}

**Weakness:** ${item.weakness}

**Quality note:** ${item.qualityNote}

**Human rating:** ____________________

**Human comments:**


`).join("\n")}
## Human conclusion

Preferred finalist: ____________________

Overall status: PASS / NEEDS_TARGETED_TUNING / MOVE_TO_EXPERIMENTAL

Comments:

`;
}

async function main() {
  if (!process.argv.includes("--live") || process.env.CONFIRM_PRIORITY_LANGUAGE_LIVE !== "RUN_APPROVED_SENSE_CHECKS") {
    throw new Error("Requires --live and CONFIRM_PRIORITY_LANGUAGE_LIVE=RUN_APPROVED_SENSE_CHECKS.");
  }
  const maximum = maximumEstimatedCost();
  if (maximum.total > MAXIMUM_AUTHORIZED_COST_USD + Number.EPSILON) throw new Error("Cost ceiling exceeded.");
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required.");
  const requestedKey = process.argv.find((argument) => argument.startsWith("--only="))?.slice("--only=".length);
  const italianAuthorizedRun = process.argv.includes("--italian-authorized");
  if (italianAuthorizedRun && requestedKey !== "italian") throw new Error("The Italian authorization mode requires --only=italian.");
  if (italianAuthorizedRun) {
    const italianMaximum = italianMaximumEstimatedCost();
    if (italianMaximum.total > ITALIAN_MAXIMUM_AUTHORIZED_COST_USD + Number.EPSILON) throw new Error("Italian cost ceiling exceeded.");
  }
  const activeRuns = requestedKey ? LANGUAGE_RUNS.filter((run) => run.key === requestedKey) : LANGUAGE_RUNS;
  if (!activeRuns.length) throw new Error(`Unknown --only language: ${requestedKey}`);
  const directory = resolve(`artifacts/priority-language-sense-check-${Date.now()}`);
  await Promise.all([mkdir(resolve(directory, "raw"), { recursive: true }), mkdir(resolve(directory, "parsed"), { recursive: true }), mkdir(resolve(directory, "review"), { recursive: true })]);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const usage: UsageRecord[] = [];
  const results: any[] = [];
  await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify({ status: "running", model: MODEL, reasoningEffort: REASONING_EFFORT, automaticRetries: 0, maximumCalls: MAX_CALLS, maximumEstimatedCostUsd: maximum.total, runs: LANGUAGE_RUNS }, null, 2)}\n`);

  for (const run of activeRuns) {
    try {
      let candidates: any[];
      if (run.draft) {
        const prompt = draftingPrompt(run); ensurePromptBudget(prompt);
        const draftOutputTokens = italianAuthorizedRun ? ITALIAN_DRAFT_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS;
        const response = await controlledResponse({ client, requestSignal: AbortSignal.timeout(150_000), action: `priority-language.${run.key}.draft`, model: MODEL, maxOutputTokens: draftOutputTokens, timeoutMs: 150_000,
          body: { model: MODEL, reasoning: { effort: REASONING_EFFORT }, input: prompt, text: { format: { type: "json_schema", name: "priority_language_paired_drafts", strict: true, schema: pairedDraftJsonSchema } } } });
        usage.push(response.usage);
        await writeFile(resolve(directory, "raw", `${run.key}-draft-response.json`), `${JSON.stringify(response.response, null, 2)}\n`);
        if (response.response.status !== "completed" || !response.response.output_text?.trim()) throw new Error(`${run.key} drafting incomplete: ${response.response.incomplete_details?.reason || response.response.status}`);
        candidates = pairedDraftSchema.parse(JSON.parse(response.response.output_text)).candidates;
        await writeFile(resolve(directory, "parsed", `${run.key}-drafts.json`), `${JSON.stringify(candidates, null, 2)}\n`);
      } else {
        candidates = run.saved === "german" ? await savedGermanCandidates() : await savedSpanishCandidates();
      }
      const prompt = editorPrompt(run, candidates as any); ensurePromptBudget(prompt);
      if (italianAuthorizedRun) {
        const measuredInputTokens = await measuredEditorInputEstimate(prompt);
        await writeFile(resolve(directory, "parsed", "italian-editor-preflight.json"), `${JSON.stringify({
          method: "o200k prompt delta anchored to the completed Croatian call",
          croatianMeasuredInputTokens: CROATIAN_MEASURED_EDITOR_INPUT_TOKENS,
          italianMeasuredInputEstimate: measuredInputTokens,
          ceiling: ITALIAN_EDITOR_INPUT_CEILING,
          editorCallAllowed: measuredInputTokens <= ITALIAN_EDITOR_INPUT_CEILING
        }, null, 2)}\n`);
        if (measuredInputTokens > ITALIAN_EDITOR_INPUT_CEILING) throw new Error(`Italian editor estimate ${measuredInputTokens} exceeds ${ITALIAN_EDITOR_INPUT_CEILING}; editor not launched.`);
      }
      const response = await controlledResponse({ client, requestSignal: AbortSignal.timeout(150_000), action: `priority-language.${run.key}.editor`, model: MODEL, maxOutputTokens: MAX_OUTPUT_TOKENS, timeoutMs: 150_000,
        body: { model: MODEL, reasoning: { effort: REASONING_EFFORT }, input: prompt, text: { format: { type: "json_schema", name: "priority_language_editorial", strict: true, schema: editorialJsonSchema } } } });
      usage.push(response.usage);
      await writeFile(resolve(directory, "raw", `${run.key}-editor-response.json`), `${JSON.stringify(response.response, null, 2)}\n`);
      if (response.response.status !== "completed" || !response.response.output_text?.trim()) throw new Error(`${run.key} editorial incomplete: ${response.response.incomplete_details?.reason || response.response.status}`);
      const editorial = editorialSchema.parse(JSON.parse(response.response.output_text)); validateEditorial(editorial);
      await writeFile(resolve(directory, "parsed", `${run.key}-editorial.json`), `${JSON.stringify(editorial, null, 2)}\n`);
      await writeFile(resolve(directory, "review", `${run.key}.md`), reviewMarkdown(run.label, editorial, sourcePair()));
      results.push({ key: run.key, label: run.label, status: "completed", recommendation: editorial.finalists.find((item) => item.recommendedFinalist)?.sourceCandidateId });
      if (run.key === "serbian-cyrillic") {
        const latin = { finalists: editorial.finalists.map((item) => ({ ...item, page1Text: serbianCyrillicToLatin(item.page1Text), page2Text: serbianCyrillicToLatin(item.page2Text), refrainPage1: serbianCyrillicToLatin(item.refrainPage1), refrainPage2: serbianCyrillicToLatin(item.refrainPage2), rhymePairs: item.rhymePairs.map((pair) => ({ ...pair, words: pair.words.map(serbianCyrillicToLatin) })) })) };
        const scriptChecks = { source: "serbian-cyrillic", paidCalls: 0, finalistCountMatches: latin.finalists.length === editorial.finalists.length, lineCountsPreserved: latin.finalists.every((item, index) => item.page1Text.split("\n").length === editorial.finalists[index].page1Text.split("\n").length && item.page2Text.split("\n").length === editorial.finalists[index].page2Text.split("\n").length), cyrillicContainsLatinLetters: editorial.finalists.some((item) => /[A-Za-z]/u.test(`${item.page1Text}${item.page2Text}`)) };
        await writeFile(resolve(directory, "parsed", "serbian-latin-editorial.json"), `${JSON.stringify({ ...latin, scriptChecks }, null, 2)}\n`);
        await writeFile(resolve(directory, "review", "serbian-latin.md"), reviewMarkdown("Serbian — Latin", latin as any, sourcePair()));
        results.push({ key: "serbian-latin", label: "Serbian — Latin", status: "completed_from_cyrillic", scriptChecks });
      }
    } catch (error) {
      results.push({ key: run.key, label: run.label, status: "failed", error: error instanceof Error ? error.message : String(error) });
      await writeFile(resolve(directory, "parsed", `${run.key}-failure.json`), `${JSON.stringify(results.at(-1), null, 2)}\n`);
    }
  }
  const totals = usageTotals(usage);
  await writeFile(resolve(directory, "usage-and-cost.json"), `${JSON.stringify({ maximum, actual: totals, calls: usage }, null, 2)}\n`);
  await writeFile(resolve(directory, "cross-language-summary.md"), `# Priority-language sense checks\n\n${results.map((item) => `- **${item.label}:** ${item.status} — human status pending`).join("\n")}\n\nNo PASS / NEEDS_TARGETED_TUNING / MOVE_TO_EXPERIMENTAL decision is final before human review.\n`);
  await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify({ status: "completed", completedAt: new Date().toISOString(), model: MODEL, reasoningEffort: REASONING_EFFORT, automaticRetries: 0, maximumCalls: MAX_CALLS, maximumEstimatedCostUsd: maximum.total, actual: totals, results }, null, 2)}\n`);
  console.log(JSON.stringify({ directory, totals, results }, null, 2));
}

if (process.argv[1]?.endsWith("live-priority-language-sense-checks.ts")) void main();
