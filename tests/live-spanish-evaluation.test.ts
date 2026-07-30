import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MULTILINGUAL_EVALUATION_FIXTURES } from "./fixtures/multilingual-evaluation-fixtures.ts";

test("Spanish live evaluation is six real-book fixtures and is explicitly approval-gated", async () => {
  const harness = await readFile(
    new URL("../scripts/live-spanish-evaluation.ts", import.meta.url),
    "utf8"
  );
  assert.equal(MULTILINGUAL_EVALUATION_FIXTURES.length, 6);
  assert.deepEqual(
    new Set(MULTILINGUAL_EVALUATION_FIXTURES.map((fixture) => fixture.sourceBook)),
    new Set(["I Love You So Mush", "Llama Llama Red Pajama"])
  );
  assert.match(harness, /CONFIRM_SPANISH_LIVE/);
  assert.match(harness, /RUN_SPANISH_EVALUATION/);
  assert.match(harness, /--live/);
  assert.match(harness, /--language=es-ES/);
  assert.match(harness, /automaticRetries: 0/);
  assert.match(harness, /MAX_ESTIMATED_COST_USD/);
  assert.match(harness, /estimatedModelCostUsd/);
  assert.match(harness, /draftOptions/);
  assert.match(harness, /editorialAssessment/);
  assert.match(harness, /warnings/);
});
