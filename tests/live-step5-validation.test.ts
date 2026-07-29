import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Step 5 live validation is one-attempt, bounded, and approval-gated", async () => {
  const source = await readFile(new URL("../scripts/live-step5-validation.ts", import.meta.url), "utf8");
  assert.match(source, /const TOTAL_TIMEOUT_MS = 255_000/);
  assert.match(source, /const MAX_ESTIMATED_COST_USD = 0\.295/);
  assert.match(source, /const AUTOMATIC_RETRIES = 0/);
  assert.match(source, /CONFIRM_STEP5_LIVE/);
  assert.match(source, /freshDraft:\s*true/);
  assert.equal((source.match(/fetch\("http:\/\/localhost:3000\/api\/directions"/g) || []).length, 1);
  assert.match(source, /reachedOutputAllowance/);
  assert.match(source, /candidateCountEnteringEditor/);
});
