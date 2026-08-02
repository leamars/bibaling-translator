import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bookFormClassifierPrompt,
  mockBookFormAnalysis,
  nextAfterFreedom,
  page1BackStep,
  requiresRhyme,
  workshopProgress
} from "../app/api/book-form-contract.ts";
import {
  bookFormContract,
  fullBookEditorialPrompt,
  translationGenerationPrompt
} from "../app/api/translation-prompts.ts";
import { evaluationPasses, type CandidateEvaluation } from "../app/api/translation-quality.ts";

const passingExceptRhyme: CandidateEvaluation = {
  candidateId: "c01",
  fidelityPass: true,
  grammarPass: true,
  readAloudPass: true,
  directionPass: true,
  rhymePass: false,
  pass: true,
  reasons: []
};

test("clear prose classification", () => {
  const result = mockBookFormAnalysis([
    "Mara opened the gate and followed the path.",
    "At the pond, she found a tiny boat.",
    "She sailed home before supper."
  ]);
  assert.equal(result.bookForm, "prose_story");
  assert.equal(result.sourceRhyme, "none");
});

test("continuous verse with rhyme but no refrain", () => {
  const result = mockBookFormAnalysis([
    "Through the meadow, soft and slow,\nLittle fireflies start to glow.",
    "Past the hill in silver light,\nOwls awaken in the night.",
    "Over stones the waters flow,\nHomeward all the rabbits go."
  ]);
  assert.equal(result.bookForm, "continuous_verse");
  assert.equal(result.sourceRhyme, "sustained");
});

test("poetic non-rhyming verse without a refrain", () => {
  const result = mockBookFormAnalysis([
    "Morning opens\nacross the quiet field",
    "A red leaf turns\nunder the bridge",
    "We listen\nuntil the rain ends"
  ]);
  assert.equal(result.bookForm, "continuous_verse");
  assert.equal(result.sourceRhyme, "none");
});

test("genuine recurring refrain detection is conservative", () => {
  const result = mockBookFormAnalysis([
    "Bear climbs the hill.\nTogether we can find the way.",
    "Fox crosses the stream.\nTogether we can find the way.",
    "Rabbit enters the wood.\nTogether we can find the way."
  ]);
  assert.equal(result.bookForm, "refrain_verse");

  const ordinaryRepetition = mockBookFormAnalysis([
    "The little bear walks into town.",
    "The little fox waits beside a tree.",
    "The little rabbit carries a blue bag."
  ]);
  assert.notEqual(ordinaryRepetition.bookForm, "refrain_verse");
});

test("classifier prompt separates source rhyme from the three workflows", () => {
  const prompt = bookFormClassifierPrompt({
    texts: ["One.", "Two.", "Three."],
    visualContexts: ["A.", "B.", "C."]
  });
  assert.match(prompt, /sourceRhyme/);
  assert.match(prompt, /Be conservative about refrain_verse/);
  assert.match(prompt, /similar-but-different sentences are not a refrain/);
});

test("parent-selected routes skip or enter Refrain Lab deterministically", () => {
  assert.equal(nextAfterFreedom("prose_story"), "page1");
  assert.equal(nextAfterFreedom("continuous_verse"), "page1");
  assert.equal(nextAfterFreedom("refrain_verse"), "refrain_lab");
  assert.equal(page1BackStep("prose_story"), 5);
  assert.equal(page1BackStep("refrain_verse"), 6);
  assert.deepEqual(workshopProgress("prose_story", 7), { current: 6, total: 11 });
  assert.deepEqual(workshopProgress("refrain_verse", 7), { current: 7, total: 12 });
});

test("non-refrain prompts and payload contracts contain no fabricated refrain", async () => {
  const prose = translationGenerationPrompt({
    spreadNumber: 1,
    source: "The child opens the door.",
    priority: "rhythm",
    freedom: "natural",
    bookForm: "prose_story",
    sourceRhyme: "none"
  });
  assert.match(prose, /A STORY, NOT A POEM/);
  assert.match(prose, /rhyme, meter, verse lineation, chants, and refrains are prohibited/);
  assert.doesNotMatch(prose, /Exact refrain\/device:/);

  const verse = translationGenerationPrompt({
    spreadNumber: 1,
    source: "Morning opens\nacross the field",
    priority: "rhythm",
    freedom: "natural",
    bookForm: "continuous_verse",
    sourceRhyme: "none"
  });
  assert.match(verse, /A RHYMING OR POETIC STORY/);
  assert.match(verse, /End rhyme is not required/);
  assert.doesNotMatch(verse, /Exact refrain\/device:/);

  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8");
  assert.match(page, /\.\.\.\(lockedDirection \? \{ direction: lockedDirection \} : \{\}\)/);
  assert.match(route, /non-refrain workflows must not send a direction/);
});

test("all three forms have explicit locked prompt contracts", () => {
  assert.match(bookFormContract("prose_story", "none"), /Do not introduce rhyme/);
  assert.match(bookFormContract("continuous_verse", "none"), /Do not invent a fixed recurring refrain/);
  assert.match(bookFormContract("refrain_verse", "sustained", {
    name: "Approved",
    refrain: "Skupaj najdemo pot.",
    approach: "Recurring line",
    genderDependency: "None"
  }), /Exact refrain\/device: Skupaj najdemo pot/);
});

test("rhyme gates apply only when the form and source require rhyme", () => {
  assert.equal(requiresRhyme({ bookForm: "prose_story", sourceRhyme: "sustained", priority: "rhythm" }), false);
  assert.equal(requiresRhyme({ bookForm: "continuous_verse", sourceRhyme: "none", priority: "rhythm" }), false);
  assert.equal(requiresRhyme({ bookForm: "continuous_verse", sourceRhyme: "sustained", priority: "meaning" }), true);
  assert.equal(evaluationPasses("To je topel dan.", "rhythm", passingExceptRhyme, {
    bookForm: "prose_story",
    sourceRhyme: "none"
  }), true);
  assert.equal(evaluationPasses("Jutro vstaja.\nPolje čaka.", "rhythm", passingExceptRhyme, {
    bookForm: "continuous_verse",
    sourceRhyme: "none"
  }), true);
});

test("full-book editorial contract carries route and source-rhyme context", () => {
  const prompt = fullBookEditorialPrompt({
    spreads: [{ spread: 4, source: "The fox arrives.", visualContext: "A fox at the door." }],
    priority: "rhythm",
    freedom: "natural",
    bookForm: "prose_story",
    sourceRhyme: "none",
    approvedVoice: [
      { spread: 1, text: "Prva stran." },
      { spread: 2, text: "Druga stran." },
      { spread: 3, text: "Tretja stran." }
    ],
    draftsJson: "[]"
  });
  assert.match(prompt, /absence of invented rhyme or refrain/);
});

test("UI preserves recommendation override, Step 5 errors, and accessible cards", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  assert.match(page, /recommendedBookForm === option\.value/);
  assert.match(page, /setRecommendedBookForm\(result\.bookForm\);\s*setBookFormConfirmed\(true\)/);
  assert.match(page, />Recommended<\/small>/);
  assert.match(page, /setBookForm\(option\.value\)/);
  assert.match(page, /setBookFormConfirmed\(true\)/);
  assert.match(page, /FINAL_SET_INVALID/);
  assert.match(page, /role="button"/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(page, /aria-pressed/);
  assert.match(page, /event\.key === "Enter" \|\| event\.key === " "/);
});
