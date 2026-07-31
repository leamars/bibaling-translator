import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const harnessPath = new URL(
  "../scripts/live-spanish-editor-only-reevaluation.ts",
  import.meta.url
);

test("Spanish reevaluation is editor-only, seven-call, bounded, and retry-free", async () => {
  const source = await readFile(harnessPath, "utf8");

  assert.match(source, /const CALL_COUNT = 7/);
  assert.match(source, /const MAX_ESTIMATED_COST_USD = 1\.005/);
  assert.match(source, /const APPROVED_COST_CEILING_USD = 1\.01/);
  assert.match(source, /maxRetries: 0/);
  assert.match(source, /directionsEvaluationPrompt/);
  assert.match(source, /translationEvaluationPrompt/);
  assert.doesNotMatch(source, /directionsGenerationPrompt/);
  assert.doesNotMatch(source, /translationGenerationPrompt/);
  assert.match(source, /finalized-human-review\.json/);
  assert.match(source, /savedBundle\.refrainSetup\.survivingDrafts/);
  assert.match(source, /fixture\.draftOptions/);
});
