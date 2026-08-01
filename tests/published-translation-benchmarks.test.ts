import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLISHED_TRANSLATION_BENCHMARKS,
  publishedTranslationBenchmarkPrompt,
  publishedTranslationBenchmarksFor
} from "../app/languages/published-translation-benchmarks.ts";
import { languagePromptGuidance } from "../app/languages/prompt-guidance.ts";

test("the registry contains two prompt-ready benchmarks per priority language", () => {
  assert.equal(PUBLISHED_TRANSLATION_BENCHMARKS.length, 10);
  for (const language of ["de", "es", "it", "hr", "sr"] as const) {
    assert.equal(publishedTranslationBenchmarksFor(language).length, 2);
  }
});

test("the German Llama benchmark contains the four user-confirmed passages", () => {
  const benchmark = PUBLISHED_TRANSLATION_BENCHMARKS.find(
    (item) => item.id === "de-llama-llama-red-pajama"
  );
  assert.ok(benchmark);
  assert.equal(benchmark.confirmedExcerpts?.length, 4);
  assert.deepEqual(benchmark.confirmedExcerpts, [
    "Lama Lama im Pyjama\nliest ein Buch mit seiner Mama.",
    "Gute Nacht, nun schlaf recht schön,\nMama muss jetzt runtergehen.",
    "Lama Lama im Pyjama\nquengelt leis nach seiner Mama.",
    "Lama Lama, hör mal zu.\nMama Lama braucht jetzt Ruh.\nKann nicht immer bei dir sein,\nlass dich aber niemals allein."
  ]);
  assert.equal(benchmark.translator, "Christiane Steen");
  assert.equal(benchmark.isbn, "978-3-499-00080-5");
});

test("benchmark prompts are language-isolated", () => {
  const german = publishedTranslationBenchmarkPrompt("de");
  const spanish = publishedTranslationBenchmarkPrompt("es");
  const croatian = publishedTranslationBenchmarkPrompt("hr");

  assert.match(german, /Lama Lama im Pyjama/);
  assert.match(german, /Der Grüffelo/);
  assert.doesNotMatch(german, /El Grúfalo|Il Gruffalò|Grubzon|Grozon/);

  assert.match(spanish, /La llama llama rojo pijama/);
  assert.doesNotMatch(spanish, /Lama Lama im Pyjama|La strega Rossella|Grubzon/);

  assert.match(croatian, /Grubzon/);
  assert.doesNotMatch(croatian, /Grozon|Lama Lama im Pyjama/);
});

test("unbenchmarked languages receive no benchmark block", () => {
  assert.equal(publishedTranslationBenchmarkPrompt("sl"), "");
  assert.doesNotMatch(languagePromptGuidance({ targetLanguage: "sl" }), /PUBLISHED-TRANSLATION BENCHMARKS/);
});

test("the prompt teaches techniques without authorizing copying or reconstruction", () => {
  const prompt = languagePromptGuidance({ targetLanguage: "de" });
  assert.match(prompt, /Learn from the techniques, not the wording/);
  assert.match(prompt, /Do not copy an excerpt into another book/);
  assert.match(prompt, /Do not continue, reconstruct, or imitate unlisted text/);
  assert.match(prompt, /language-based, not title-aware/);
  assert.match(prompt, /Fidelity to the user's corrected English source and illustrations/);
});

test("every benchmark carries provenance and reusable technique notes", () => {
  for (const benchmark of PUBLISHED_TRANSLATION_BENCHMARKS) {
    assert.ok(benchmark.evidence.length > 0);
    assert.ok(benchmark.transferableTechniques.length > 0);
    for (const evidence of benchmark.evidence) {
      assert.match(evidence.url, /^https:\/\//);
      assert.ok(evidence.note.length > 0);
    }
  }
});
