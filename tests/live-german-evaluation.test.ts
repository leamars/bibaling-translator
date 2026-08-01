import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LANGUAGE_CONFIGS } from "../app/languages/language-config.ts";
import {
  pairedDraftPrompt,
  pairedEditorPrompt,
  pairedVerseDraftSchema
} from "../scripts/live-german-evaluation.ts";
import { GERMAN_EVALUATION_FIXTURES } from "./fixtures/german-evaluation-fixtures.ts";

const harnessPath = new URL("../scripts/live-german-evaluation.ts", import.meta.url);
const blindBuilderPath = new URL("../scripts/build-spanish-blind-review.ts", import.meta.url);

test("German guidance is independent, oral, and structure-aware", () => {
  const config = LANGUAGE_CONFIGS.de;
  for (const phrase of [
    "neutral contemporary Standard German",
    "natural spoken German clause order",
    "separable verbs",
    "transparent, child-friendly compounds",
    "do not introduce line-broken verse, meter, rhyme, chants, or a repeated line",
    "stressed vowel onward",
    "grammatical endings are not sufficient evidence"
  ]) {
    assert.match(`${config.draftingGuidance}\n${config.editorialGuidance}`, new RegExp(phrase));
  }
  assert.doesNotMatch(`${config.draftingGuidance}\n${config.editorialGuidance}`, /Spanish|Slovenian|mogollón|goba|čisto do gobic/iu);
});

test("German Mushroom fixture uses reviewed verse benchmarks and declared rhyme pairs", () => {
  const fixture = GERMAN_EVALUATION_FIXTURES.find((item) => item.id === "mush-refrain-consistency-pair")!;
  assert.match(fixture.goldStandardGuidance?.recommended || "", /Baum,\n[\s\S]*Traum\./);
  assert.deepEqual(fixture.goldStandardGuidance?.benchmarkRhymePairs, [
    ["Baum", "Traum"], ["Hut", "gut"], ["an", "kann"], ["Hut", "gut"]
  ]);
  const draftPrompt = pairedDraftPrompt(fixture);
  assert.match(draftPrompt, /Unrhymed prose split into short lines is a failure/);
  assert.match(draftPrompt, /exactly two clearly audible end-rhyme pairs/);
  assert.match(draftPrompt, /von Stiel bis Hut/);
  assert.match(draftPrompt, /never translate “mush” literally/);
  assert.match(draftPrompt, /roughly 6–10 syllables per line/);
  assert.match(draftPrompt, /rhymePairs/);
  const editorPrompt = pairedEditorPrompt(fixture, []);
  assert.match(editorPrompt, /Independently pronounce every proposed rhyme pair/);
  assert.match(editorPrompt, /NO_QUALIFYING_FINALIST/);
  assert.match(editorPrompt, /merely visual rhyme/);
});

test("paired German verse schema requires four declared rhyme pairs and refrain variants", () => {
  const base = {
    id: "c01", strategy: "test", refrainPage1: "Ich hab dich lieb von Stiel bis Hut,",
    refrainPage2: "Ich hab euch lieb von Stiel bis Hut,", page1Text: "a\nb\nc\nd", page2Text: "e\nf\ng\nh",
    rhymePairs: [
      { page: 1, lineA: 1, lineB: 2, wordA: "Baum", wordB: "Traum" },
      { page: 1, lineA: 3, lineB: 4, wordA: "Hut", wordB: "gut" },
      { page: 2, lineA: 1, lineB: 2, wordA: "an", wordB: "kann" },
      { page: 2, lineA: 3, lineB: 4, wordA: "Hut", wordB: "gut" }
    ]
  };
  assert.equal(pairedVerseDraftSchema.safeParse({ candidates: Array.from({ length: 6 }, (_, index) => ({ ...base, id: `c0${index + 1}` })) }).success, true);
  assert.equal(pairedVerseDraftSchema.safeParse({ candidates: Array.from({ length: 6 }, (_, index) => ({ ...base, id: `c0${index + 1}`, rhymePairs: base.rhymePairs.slice(0, 3) })) }).success, false);
});

test("minimal German plan covers exactly three flows and labels the prose proxy", () => {
  assert.equal(GERMAN_EVALUATION_FIXTURES.length, 3);
  assert.deepEqual(
    new Set(GERMAN_EVALUATION_FIXTURES.map((fixture) => fixture.bookForm)),
    new Set(["refrain_verse", "continuous_verse", "prose_story"])
  );
  const refrain = GERMAN_EVALUATION_FIXTURES.find((fixture) => fixture.bookForm === "refrain_verse")!;
  assert.equal(refrain.pages.length, 2);
  const proxy = GERMAN_EVALUATION_FIXTURES.find((fixture) => fixture.bookForm === "prose_story")!;
  assert.equal(proxy.routeContractProxy, true);
  assert.match(proxy.proxyLimitation || "", /not evidence of quality on genuine prose picture books/);
});

test("German harness is six-call, cost-capped, lean, and retry-free", async () => {
  const source = await readFile(harnessPath, "utf8");
  assert.match(source, /const EXPECTED_CALL_COUNT = 6/);
  assert.match(source, /const APPROVED_MAXIMUM_COST_USD = 0\.855/);
  assert.match(source, /const DRAFT_OUTPUT_TOKENS = 3_500/);
  assert.match(source, /const EDITOR_OUTPUT_TOKENS = 2_500/);
  assert.match(source, /maxRetries: 0|controlledResponse/);
  assert.match(source, /leanPageEditorialJsonSchema/);
  assert.match(source, /resolveLeanPageDecision/);
  assert.match(source, /deterministicDraftFindings/);
  assert.match(source, /stoppedWithoutRetry/);
  assert.doesNotMatch(source, /directionsGenerationPrompt|directionsEvaluationPrompt/);
});

test("blind review normalizes German lean artifacts without exposing judgments early", async () => {
  const source = await readFile(blindBuilderPath, "utf8");
  assert.match(source, /normalizeGermanBundle/);
  assert.match(source, /presentationOrder:\s*counterbalancedOrder/);
  assert.match(source, /if\s*\(!itemComplete\(item\) \|\| !review\.completedAt\)/);
  assert.match(source, /DATASET\.regionalVariant \|\| DATASET\.language/);
  assert.doesNotMatch(source, /fetch\(/);
});
