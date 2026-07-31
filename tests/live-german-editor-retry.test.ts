import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../scripts/live-german-refrain-editor-retry.ts", import.meta.url);

test("German refrain retry is one editor-only 3500-token call with no retry", async () => {
  const source = await readFile(path, "utf8");
  assert.match(source, /const OUTPUT_TOKENS = 3_500/);
  assert.match(source, /const AUTHORIZED_MAXIMUM_USD = 0\.18/);
  assert.match(source, /RETRY_REFRAIN_EDITOR_3500/);
  assert.match(source, /pairedEditorPrompt/);
  assert.match(source, /leanPageEditorialJsonSchema/);
  assert.match(source, /resolveLeanPageDecision/);
  assert.match(source, /meaningfulSharedLines/);
  assert.match(source, /ORIGINAL_INCOMPLETE_RESPONSE/);
  assert.doesNotMatch(source, /translationGenerationPrompt|directionsGenerationPrompt/);
  assert.doesNotMatch(source, /for\s*\([^)]*attempt|while\s*\(/);
});
