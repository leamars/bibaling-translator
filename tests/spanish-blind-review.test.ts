import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/build-spanish-blind-review.ts", "utf8");

test("blind review keeps identities and model judgments hidden until completion", () => {
  assert.match(source, /presentationOrder:\s*counterbalancedOrder/);
  assert.match(source, /if\s*\(!itemComplete\(item\) \|\| !review\.completedAt\)/);
  assert.match(source, /blindLabel"\)\.textContent = "Candidate "/);
  assert.match(source, /Previous automatic selection:/);
  assert.match(source, /New comparative-editor selection:/);
  assert.doesNotMatch(source, /fetch\(/);
});

test("every candidate receives an independent rating and structured concerns", () => {
  for (const rating of ["read_as_written", "needs_editing", "would_not_use"]) {
    assert.match(source, new RegExp(`"${rating}"`));
  }
  for (const reason of [
    "unnatural_phrasing",
    "meaning_changed",
    "tone_wrong",
    "awkward_read_aloud_rhythm",
    "forced_or_missing_rhyme",
    "vocabulary_unsuitable_for_young_child",
    "unsupported_invention",
    "repetition_or_consistency_problem",
    "line_or_order_structure",
    "regional_language_issue",
    "other"
  ]) {
    assert.match(source, new RegExp(`"${reason}"`));
  }
  assert.match(source, /preferredRewrite/);
  assert.match(source, /equivalentPairs/);
  assert.match(source, /noneGoodEnough/);
});

test("winner selection is explicit and separate from individual ratings", () => {
  assert.match(source, /Give this item a final conclusion/);
  assert.match(source, /One preferred candidate/);
  assert.match(source, /Two or more are effectively equivalent/);
  assert.match(source, /None are good enough/);
  assert.match(source, /humanConclusion/);
  assert.match(source, /allRated\(item\)/);
  assert.doesNotMatch(source, /humanWinner\s*=\s*[^;\n]*rating/);
});

test("private drafts can be selected without entering the primary rating flow", () => {
  assert.match(source, /allSelectableCandidates/);
  assert.match(source, /source:"private_draft"/);
  assert.match(source, /data-equivalent-conclusion/);
  assert.match(source, /preferredCandidate/);
});

test("line-specific comments preserve exact reader-facing text and order", () => {
  assert.match(source, /line_or_order_structure/);
  assert.match(source, /Comment on a specific line/);
  assert.match(source, /exactLine:candidate\.text\.split/);
  assert.match(source, /Move this page-specific line before the repeated refrain/);
  assert.match(source, /candidateText"\)\.textContent = candidate\.text/);
  assert.match(source, /font:400 clamp/);
});

test("review data is local, resumable, and importable or exportable", () => {
  assert.match(source, /localStorage\.getItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /Export JSON/);
  assert.match(source, /Import JSON/);
  assert.match(source, /evaluationId/);
  assert.match(source, /runId/);
  assert.match(source, /presentationOrder/);
  assert.match(source, /previousModelSelection/);
  assert.match(source, /currentModelSelection/);
  assert.match(source, /unresolved[\s\S]*Export an incomplete review anyway/);
});

test("review supports keyboard navigation, speech, private drafts, and summary metrics", () => {
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /SpeechSynthesisUtterance/);
  assert.match(source, /See all private drafts/);
  assert.match(source, /Would read as written/);
  assert.match(source, /Human\/editor agreement/);
  assert.match(source, /Most common concerns/);
  assert.match(source, /Preferred rewrites/);
});
