import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const harness = readFileSync("scripts/live-german-book-review-stage1.ts", "utf8");
const reviewBuilder = readFileSync("scripts/build-spanish-blind-review.ts", "utf8");

test("German book-review stage 1 is one bounded Llama drafting call with no retry", () => {
  assert.match(harness, /MAXIMUM_AUTHORIZED_COST_USD = 0\.145/);
  assert.match(harness, /OUTPUT_TOKENS = 3_500/);
  assert.match(harness, /reasoning: \{ effort: "low" \}/);
  assert.match(harness, /callCount: 1/);
  assert.match(harness, /automaticRetries: 0/);
  assert.doesNotMatch(harness, /for \(let attempt|while \(/);
  assert.doesNotMatch(harness, /translationEvaluationPrompt|editorial.*responses\.create/i);
});

test("blind review supports six unranked drafting candidates without fake editor metadata", () => {
  assert.match(reviewBuilder, /blindCandidates\?/);
  assert.match(reviewBuilder, /" of " \+ candidates\.length/);
  assert.match(reviewBuilder, /All candidates have ratings/);
  assert.match(reviewBuilder, /Original candidate/);
});
