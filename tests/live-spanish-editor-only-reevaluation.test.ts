import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const harnessPath = new URL(
  "../scripts/live-spanish-editor-only-reevaluation.ts",
  import.meta.url
);

test("Spanish reevaluation resume is editor-only, six-call, bounded, and retry-free", async () => {
  const source = await readFile(harnessPath, "utf8");

  assert.match(source, /const CALL_COUNT = 6/);
  assert.match(source, /const PAGE_EDITOR_OUTPUT_TOKENS = 3_500/);
  assert.match(source, /const PRIOR_SPEND_USD = 0\.183065/);
  assert.match(source, /const APPROVED_TOTAL_COST_CEILING_USD = 1\.25/);
  assert.match(source, /maxRetries: 0/);
  assert.match(source, /directionsEvaluationPrompt/);
  assert.match(source, /translationEvaluationPrompt/);
  assert.doesNotMatch(source, /directionsGenerationPrompt/);
  assert.doesNotMatch(source, /translationGenerationPrompt/);
  assert.match(source, /finalized-human-review\.json/);
  assert.match(source, /savedBundle\.refrainSetup\.survivingDrafts/);
  assert.match(source, /fixture\.draftOptions/);
  assert.match(source, /PRIOR_REFRAIN_RESPONSE_PATH/);
  assert.match(source, /selectionLevelAgreement/);
  assert.match(source, /NO_QUALIFYING_FINALIST/);
  assert.match(source, /equivalent group/);
  assert.match(source, /concernRecognition/);
});
