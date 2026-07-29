import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("generation-only review harness is single-call, bounded, and confirmation-gated", async () => {
  const source = await readFile(
    new URL("../scripts/live-generation-review.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /const TIMEOUT_MS = 90_000/);
  assert.match(source, /const OUTPUT_TOKEN_LIMIT = 3_500/);
  assert.match(source, /const INPUT_TOKEN_CEILING = 6_000/);
  assert.match(source, /evaluatorCalls: 0/);
  assert.match(source, /automaticRetries: 0/);
  assert.match(source, /RUN_ONE_GENERATION_ONLY_REVIEW/);
  assert.equal((source.match(/controlledResponse\(/g) || []).length, 1);
  assert.match(source, /rawCandidates/);
  assert.match(source, /process\.once\("SIGINT", cancel\)/);
});
