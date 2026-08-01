import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LANGUAGE_CONFIGS } from "../app/languages/language-config.ts";
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
