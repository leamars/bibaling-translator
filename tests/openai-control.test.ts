import assert from "node:assert/strict";
import test from "node:test";
import { calculateCost, deduplicate, pricingFor } from "../app/api/openai-control.ts";

test("cost calculation separates cached and uncached input", () => {
  const cost = calculateCost(
    { inputTokens: 1_000, cachedInputTokens: 400, outputTokens: 200 },
    { inputUsdPerMillion: 10, cachedInputUsdPerMillion: 1, outputUsdPerMillion: 30 }
  );
  assert.equal(cost, 0.0124);
});

test("deduplication shares one in-flight operation", async () => {
  let calls = 0;
  const task = () => deduplicate("same-action", async () => {
    calls += 1;
    await Promise.resolve();
    return "result";
  });
  assert.deepEqual(await Promise.all([task(), task()]), ["result", "result"]);
  assert.equal(calls, 1);
});

test("known models have reviewed pricing without local pricing configuration", () => {
  assert.deepEqual(pricingFor("gpt-4.1-mini"), {
    inputUsdPerMillion: 0.4,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 1.6
  });
  assert.deepEqual(pricingFor("gpt-5.6-sol"), {
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30
  });
});
