import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LANGUAGE_RUNS,
  draftingPrompt,
  editorialSchema,
  italianMaximumEstimatedCost,
  maximumEstimatedCost,
  serbianCyrillicToLatin
} from "../scripts/live-priority-language-sense-checks.ts";

const harnessPath = new URL("../scripts/live-priority-language-sense-checks.ts", import.meta.url);

test("priority-language plan is exactly eight approved calls with no retries", async () => {
  const source = await readFile(harnessPath, "utf8");
  assert.equal(LANGUAGE_RUNS.filter((run) => run.draft).length, 3);
  assert.equal(LANGUAGE_RUNS.length, 5);
  assert.equal(maximumEstimatedCost().total, 1.16);
  assert.match(source, /maxRetries: 0/);
  assert.match(source, /automaticRetries: 0/);
  assert.doesNotMatch(source, /for \(let retry|while \(.*retry/);
  assert.match(source, /--only=/);
});

test("Italian rerun is capped at two calls and $0.28545", async () => {
  const source = await readFile(harnessPath, "utf8");
  assert.equal(italianMaximumEstimatedCost().total, 0.28545);
  assert.match(source, /ITALIAN_DRAFT_OUTPUT_TOKENS = 5_500/);
  assert.match(source, /ITALIAN_EDITOR_INPUT_CEILING = 2_300/);
  assert.match(source, /--italian-authorized/);
  assert.match(source, /editor not launched/);
});

test("first substantive languages receive their own guidance and difficult paired fixture", () => {
  for (const key of ["italian", "croatian", "serbian-cyrillic"] as const) {
    const run = LANGUAGE_RUNS.find((item) => item.key === key)!;
    const prompt = draftingPrompt(run);
    assert.match(prompt, new RegExp(`Language: ${run.label.split(" — ")[0]}`));
    assert.match(prompt, /I love my happy, hairy friend/);
    assert.match(prompt, /These mushroom friends have many hands/);
    assert.match(prompt, /two clearly audible spoken end-rhyme pairs/);
  }
});

test("editorial schema requires three ranked parent-facing finalists and one can be recommended", () => {
  const base = {
    sourceCandidateId: "c01", page1Text: "a", page2Text: "b", refrainPage1: "r1", refrainPage2: "r2",
    rank: 1 as const, recommendedFinalist: true, naturalnessPass: true, fidelityPass: true, readAloudPass: true,
    rhymePass: true, refrainConsistencyPass: true, strength: "Natural.", weakness: "Minor.", qualityNote: "Review.",
    rhymePairs: Array.from({ length: 4 }, (_, index) => ({ page: index < 2 ? 1 as const : 2 as const, words: ["a", "b"] as [string, string], valid: true, problem: "" }))
  };
  assert.equal(editorialSchema.safeParse({ finalists: [base, { ...base, sourceCandidateId: "c02", rank: 2, recommendedFinalist: false }, { ...base, sourceCandidateId: "c03", rank: 3, recommendedFinalist: false }] }).success, true);
});

test("Serbian Cyrillic is converted locally to Latin without another model call", () => {
  assert.equal(serbianCyrillicToLatin("Љубав, њих и џеп."), "Ljubav, njih i džep.");
});
