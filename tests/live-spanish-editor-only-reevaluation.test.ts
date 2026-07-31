import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const harnessPath = new URL(
  "../scripts/live-spanish-editor-only-reevaluation.ts",
  import.meta.url
);

test("lean jiggly verification is one editor-only call, bounded, and retry-free", async () => {
  const source = await readFile(harnessPath, "utf8");

  assert.match(source, /const CALL_COUNT = 1/);
  assert.match(source, /const PAGE_EDITOR_OUTPUT_TOKENS = 2_500/);
  assert.match(source, /const MAX_VERIFICATION_COST_USD = 0\.14/);
  assert.match(source, /VERIFY_LEAN_JIGGLY_EDITOR/);
  assert.match(source, /maxRetries: 0/);
  assert.match(source, /translationEvaluationPrompt/);
  assert.doesNotMatch(source, /directionsGenerationPrompt/);
  assert.doesNotMatch(source, /translationGenerationPrompt/);
  assert.match(source, /finalized-human-review\.json/);
  assert.match(source, /fixture\.draftOptions/);
  assert.match(source, /PRIOR_REFRAIN_RESPONSE_PATH/);
  assert.match(source, /fixtureId === "mush-jiggly-orange"/);
  assert.match(source, /leanPageEditorialJsonSchema/);
  assert.match(source, /resolveLeanPageDecision/);
  assert.match(source, /selectionLevelAgreement/);
  assert.match(source, /NO_QUALIFYING_FINALIST/);
  assert.match(source, /concernRecognition/);
  assert.match(source, /move-c06-forest-line-before-refrain/);
  assert.match(source, /move-c02-forest-line-before-refrain/);
});
