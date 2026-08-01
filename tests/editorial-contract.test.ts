import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  comparativeFinalistFields,
  rhymeAssessmentSchema,
  selectRecommendedFinalist,
  validateComparativeEditorialResult,
  winnerComparisonsSchema
} from "../app/api/editorial-contract.ts";
import {
  directionsEvaluationPrompt,
  translationEvaluationPrompt
} from "../app/api/translation-prompts.ts";

const finalistSchema = z.object({
  id: z.string(),
  text: z.string(),
  fidelityPass: z.boolean(),
  grammarPass: z.boolean(),
  readAloudPass: z.boolean(),
  directionPass: z.boolean(),
  rhymePass: z.boolean(),
  ...comparativeFinalistFields
});

function finalist(rank: number, overrides: Record<string, unknown> = {}) {
  return finalistSchema.parse({
    id: `f${rank}`,
    text: `Finalist ${rank}`,
    fidelityPass: true,
    grammarPass: true,
    readAloudPass: true,
    directionPass: true,
    rhymePass: true,
    rank,
    recommendedFinalist: rank === 1,
    strengths: ["Preserves the source action in a clear child-friendly structure."],
    weaknesses: ["The closing phrase is less vivid than the strongest alternative."],
    comparativeAssessment: {
      naturalness: "Uses contemporary phrasing that sounds comfortable aloud.",
      fidelity: "Preserves the source action and emotional relationship.",
      tone: "Keeps the source warmth without making it more emphatic.",
      readAloudRhythm: "Uses balanced spoken phrases with a clear cadence.",
      rhyme: "Uses a spoken full rhyme without distorting the sentence.",
      unsupportedInvention: "Adds no unsupported event, image, or emotional claim."
    },
    rhymeAssessment: {
      required: true,
      evidence: [{
        anchorA: "canción",
        anchorB: "corazón",
        lineA: "Suena alegre la canción.",
        lineB: "Y me alegra el corazón.",
        soundFromFinalStressedVowelA: "ón",
        soundFromFinalStressedVowelB: "ón",
        classification: "full_rhyme",
        spokenAssessment: "Both lines resolve naturally on the same stressed sound.",
        grammaticalEndingOnly: false,
        repeatedWord: false,
        sameRootEcho: false,
        countsAsRhyme: true
      }],
      overallAssessment: "The complete lines form an audible, unforced full rhyme."
    },
    ...overrides
  });
}

const comparisons = winnerComparisonsSchema.parse([
  {
    alternativeRank: 2,
    whyWinnerIsBetter: "Rank 1 is more idiomatic and keeps the source tone more precisely than rank 2."
  },
  {
    alternativeRank: 3,
    whyWinnerIsBetter: "Rank 1 reads more smoothly aloud and avoids the extra image introduced by rank 3."
  }
]);

function validSet() {
  return [finalist(2), finalist(3), finalist(1)];
}

test("duplicate or missing ranks fail the comparative contract", () => {
  const duplicate = [finalist(1), finalist(2), finalist(2, { id: "duplicate" })];
  const issues = validateComparativeEditorialResult({
    finalists: duplicate,
    winnerComparisons: comparisons,
    rhymeRequired: true
  });
  assert.ok(issues.some((issue) => issue.code === "RANK_INVARIANT"));
});

test("multiple or missing recommendations fail", () => {
  for (const finalists of [
    validSet().map((item) => ({ ...item, recommendedFinalist: false })),
    validSet().map((item) => ({ ...item, recommendedFinalist: item.rank !== 3 }))
  ]) {
    const issues = validateComparativeEditorialResult({
      finalists,
      winnerComparisons: comparisons,
      rhymeRequired: true
    });
    assert.ok(issues.some((issue) => issue.code === "RECOMMENDATION_INVARIANT"));
  }
});

test("the recommended finalist must be rank 1", () => {
  const finalists = validSet().map((item) => ({
    ...item,
    recommendedFinalist: item.rank === 2
  }));
  const issues = validateComparativeEditorialResult({
    finalists,
    winnerComparisons: comparisons,
    rhymeRequired: true
  });
  assert.ok(issues.some((issue) => issue.code === "RECOMMENDATION_RANK_INVARIANT"));
});

test("selector chooses unique rank 1 rather than first all-passing finalist", () => {
  const finalists = validSet();
  const selection = selectRecommendedFinalist({
    finalists,
    winnerComparisons: comparisons,
    rhymeRequired: true
  });
  assert.equal(selection.ok, true);
  if (selection.ok) {
    assert.equal(selection.finalist.rank, 1);
    assert.equal(selection.finalist.id, "f1");
  }
});

test("generic or purely complimentary weaknesses fail", () => {
  for (const weakness of ["None", "Strong option"]) {
    const finalists = validSet();
    finalists[0] = { ...finalists[0], weaknesses: [weakness] };
    const issues = validateComparativeEditorialResult({
      finalists,
      winnerComparisons: comparisons,
      rhymeRequired: true
    });
    assert.ok(issues.some((issue) => issue.code === "GENERIC_ASSESSMENT"));
  }
  assert.throws(() => finalistSchema.parse({
    ...finalist(1),
    weaknesses: []
  }));
});

test("a fully passing lower-ranked option is not selected", () => {
  const finalists = validSet();
  assert.equal(finalists[0].rank, 2);
  assert.equal(finalists[0].fidelityPass, true);
  const selection = selectRecommendedFinalist({
    finalists,
    winnerComparisons: comparisons,
    rhymeRequired: true
  });
  assert.equal(selection.ok && selection.finalist.rank, 1);
});

test("no qualifying finalist produces a structured failure", () => {
  const finalists = validSet().map((item) => ({
    ...item,
    fidelityPass: false
  }));
  const selection = selectRecommendedFinalist({
    finalists,
    winnerComparisons: comparisons,
    rhymeRequired: true
  });
  assert.equal(selection.ok, false);
  if (!selection.ok) assert.equal(selection.error.code, "NO_QUALIFYING_FINALIST");
});

test("rhyme classifications, anchors, and stressed-vowel evidence are retained", () => {
  const assessment = rhymeAssessmentSchema.parse(finalist(1).rhymeAssessment);
  assert.equal(assessment.evidence[0].classification, "full_rhyme");
  assert.equal(assessment.evidence[0].anchorA, "canción");
  assert.equal(assessment.evidence[0].soundFromFinalStressedVowelB, "ón");
  assert.equal(assessment.evidence[0].countsAsRhyme, true);
});

test("non-rhyming fixtures are not penalized for lacking rhyme", () => {
  const finalists = validSet().map((item) => ({
    ...item,
    rhymePass: false,
    rhymeAssessment: {
      required: false,
      evidence: [],
      overallAssessment: "The approved source form is intentionally non-rhyming verse."
    }
  }));
  const selection = selectRecommendedFinalist({
    finalists,
    winnerComparisons: comparisons,
    rhymeRequired: false
  });
  assert.equal(selection.ok, true);
  if (selection.ok) assert.equal(selection.finalist.rank, 1);
});

test("Refrain Lab and page editing both use the compact production contract", () => {
  const refrainPrompt = directionsEvaluationPrompt({
    texts: ["We love you so much."],
    visualContexts: ["A mushroom with friends."],
    priority: "rhythm",
    freedom: "natural",
    directionsJson: "[]",
    targetLanguage: "es",
    regionalVariant: "es-ES"
  });
  const pagePrompt = translationEvaluationPrompt({
    spreadNumber: 1,
    source: "Moon above. River below.",
    priority: "rhythm",
    freedom: "natural",
    bookForm: "continuous_verse",
    sourceRhyme: "none",
    candidatesJson: "[]",
    targetLanguage: "es",
    regionalVariant: "es-ES"
  });
  assert.match(refrainPrompt, /unique ranks 1, 2, and 3/);
  assert.match(refrainPrompt, /recommendedFinalist=true for exactly one finalist/);
  assert.match(refrainPrompt, /strength: one specific material strength/);
  assert.match(pagePrompt, /PAGE EDITORIAL CONTRACT/);
  assert.match(pagePrompt, /unique ranks 1, 2, and 3/);
  assert.match(pagePrompt, /do not disguise that failure/);
  assert.match(pagePrompt, /natural contemporary Spanish/);
  assert.match(pagePrompt, /Rhyme is not required/);
  assert.match(pagePrompt, /Do not penalize its absence/);
  // Production prompts no longer request the deep audit paperwork.
  for (const prompt of [refrainPrompt, pagePrompt]) {
    assert.doesNotMatch(prompt, /winnerComparisons|comparativeAssessment|appliedEdits|concernFindings|equivalent_group/);
  }
});

test("production Refrain Lab and page routes use the compact production contract", async () => {
  const [directionsRoute, translationsRoute] = await Promise.all([
    readFile(new URL("../app/api/directions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8")
  ]);
  assert.match(directionsRoute, /productionFinalistJsonProperties/);
  assert.match(directionsRoute, /validateProductionDirectionResult/);
  assert.match(directionsRoute, /selectProductionRecommendedDirection/);
  assert.match(translationsRoute, /productionPageEditorialJsonSchema/);
  assert.match(translationsRoute, /resolveProductionPageResult/);
  // Deep audit shapes stay confined to the live-evaluation harness.
  for (const route of [directionsRoute, translationsRoute]) {
    assert.doesNotMatch(route, /winnerComparisons|comparativeJsonProperties|leanPageEditorialJsonSchema|resolveLeanPageDecision/);
  }
  assert.doesNotMatch(translationsRoute, /\.find\(allPasses\)|finalists\[0\]/);
});
