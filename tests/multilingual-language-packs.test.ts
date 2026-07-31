import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LANGUAGE_CONFIGS,
  resolveLanguageSelection
} from "../app/languages/language-config.ts";
import {
  directionsEvaluationPrompt,
  directionsGenerationPrompt,
  fullBookEditorialPrompt,
  fullBookGenerationPrompt,
  translationEvaluationPrompt,
  translationGenerationPrompt
} from "../app/api/translation-prompts.ts";
import { createLeadReceipt, verifyLeadReceipt } from "../app/api/leads/receipt.ts";
import { runMockEvaluation } from "../scripts/multilingual-evaluation.ts";
import { MULTILINGUAL_EVALUATION_FIXTURES } from "./fixtures/multilingual-evaluation-fixtures.ts";
import {
  deriveRefrainBudget,
  validateFinalEditorialSet
} from "../app/api/direction-pipeline.ts";

const base = {
  priority: "rhythm" as const,
  freedom: "natural" as const,
  bookForm: "continuous_verse" as const,
  sourceRhyme: "none" as const,
  targetLanguage: "de" as const,
  source: "Moon above. River below.",
  visualContext: "A moon over a river."
};

test("priority and reviewed language packs are explicit and variants are material", () => {
  assert.equal(LANGUAGE_CONFIGS.sl.status, "reviewed");
  for (const code of ["es", "de", "it", "hr", "sr"] as const) {
    assert.equal(LANGUAGE_CONFIGS[code].status, "priority_evaluation");
  }
  assert.equal(resolveLanguageSelection("es", "es-419").languageTag, "es-419");
  assert.equal(resolveLanguageSelection("sr", "sr-Latn").languageTag, "sr-Latn-RS");
  assert.throws(() => resolveLanguageSelection("de", "es-ES"));
});

test("the selected language reaches every drafting and editorial stage", () => {
  const directionArgs = {
    texts: ["Come along!", "Come along!", "Come along!"],
    visualContexts: ["Friends walk.", "Friends skip.", "Friends arrive."],
    priority: "rhythm" as const,
    freedom: "natural" as const,
    targetLanguage: "de" as const
  };
  const prompts = [
    directionsGenerationPrompt(directionArgs),
    directionsEvaluationPrompt({ ...directionArgs, directionsJson: "{\"candidates\":[]}" }),
    translationGenerationPrompt({ ...base, spreadNumber: 1 }),
    translationEvaluationPrompt({ ...base, spreadNumber: 1, candidatesJson: "{\"candidates\":[]}" }),
    fullBookGenerationPrompt({
      ...base,
      spreads: [{ spread: 2, source: base.source, visualContext: base.visualContext }],
      approvedVoice: [{ spread: 1, text: "Genehmigte Stimme." }]
    }),
    fullBookEditorialPrompt({
      ...base,
      spreads: [{ spread: 2, source: base.source, visualContext: base.visualContext }],
      approvedVoice: [{ spread: 1, text: "Genehmigte Stimme." }],
      draftsJson: "{\"spreads\":[]}"
    })
  ];
  for (const prompt of prompts) {
    assert.match(prompt, /Language: German/);
    assert.match(prompt, /native German children's-book editor|German children's-book editor/);
  }
});

test("one language never receives another language pack guidance", () => {
  const german = translationEvaluationPrompt({ ...base, spreadNumber: 1, candidatesJson: "{}" });
  assert.doesNotMatch(german, /Slovenian verse guide|goba|čisto do gobic|Croatianisms/);
  assert.doesNotMatch(german, /Serbian Cyrillic|Latin American Spanish/);
  const croatian = translationGenerationPrompt({ ...base, targetLanguage: "hr", spreadNumber: 1 });
  assert.match(croatian, /Language: Croatian/);
  assert.doesNotMatch(croatian, /standard Serbian|natural Slovenian/);
});

test("Slovenian default and explicit Slovenian remain equivalent", () => {
  const implicit = translationGenerationPrompt({
    spreadNumber: 1, source: "Hello.", priority: "meaning", freedom: "natural",
    bookForm: "prose_story", sourceRhyme: "none"
  });
  const explicit = translationGenerationPrompt({
    spreadNumber: 1, source: "Hello.", priority: "meaning", freedom: "natural",
    bookForm: "prose_story", sourceRhyme: "none", targetLanguage: "sl"
  });
  assert.equal(explicit, implicit);
  assert.match(explicit, /Mandatory Slovenian baseline/);
});

test("approved refrains and regional variants remain locked", () => {
  const prompt = fullBookEditorialPrompt({
    priority: "rhythm", freedom: "natural", bookForm: "refrain_verse", sourceRhyme: "sustained",
    targetLanguage: "sr", regionalVariant: "sr-Latn",
    direction: { name: "Hook", refrain: "Hajde sa mnom!", approach: "Repeat", genderDependency: "None" },
    spreads: [{ spread: 2, source: "Come with me!", visualContext: "" }],
    approvedVoice: [{ spread: 1, text: "Hajde sa mnom!" }],
    draftsJson: "{\"spreads\":[]}"
  });
  assert.match(prompt, /Serbian Latin script/);
  assert.match(prompt, /Hajde sa mnom!/);
  assert.match(prompt, /exact parent-approved Serbian refrain/);
});

test("signed lead receipts bind language and regional variant", () => {
  const previous = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-secret";
  try {
    const receipt = createLeadReceipt("prose_story", "es", "es-ES");
    assert.equal(verifyLeadReceipt(receipt, "prose_story", "es", "es-ES"), true);
    assert.equal(verifyLeadReceipt(receipt, "prose_story", "es", "es-419"), false);
    assert.equal(verifyLeadReceipt(receipt, "prose_story", "de"), false);
  } finally {
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});

test("mock evaluation covers six languages and six literary fixtures", async () => {
  const records = await runMockEvaluation();
  assert.equal(records.length, 36);
  assert.deepEqual(new Set(records.map((record) => record.targetLanguage)), new Set(["es", "de", "it", "hr", "sr", "sl"]));
  assert.deepEqual(new Set(records.map((record) => record.category)), new Set(["dialogue", "verse", "refrain", "wordplay", "baby_language"]));
  assert.deepEqual(
    new Set(MULTILINGUAL_EVALUATION_FIXTURES.map((fixture) => fixture.sourceBook)),
    new Set(["I Love You So Mush", "Llama Llama Red Pajama"])
  );
  assert.ok(records.every((record) => record.draftingOptions.length === 6));
  assert.ok(records.every((record) => record.editorialAssessment.length === 3));
});

test("language selection follows OCR confirmation and precedes translation priorities", async () => {
  const translator = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const uploadHeading = translator.indexOf("Add every page from your book.");
  const ocrHeading = translator.indexOf("Did we read these correctly?");
  const languageHeading = translator.indexOf("What language should we translate this book into?");
  const priorityHeading = translator.indexOf("What matters most for this book?");

  assert.ok(uploadHeading >= 0);
  assert.ok(ocrHeading > uploadHeading);
  assert.ok(languageHeading > ocrHeading);
  assert.ok(priorityHeading > languageHeading);
  assert.doesNotMatch(
    translator.slice(uploadHeading, ocrHeading),
    /id="target-language"|Translate into/
  );
});

test("experimental feedback is associated with language, variant, and page", async () => {
  const translator = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  assert.match(translator, /bibaling_experimental_language_feedback/);
  assert.match(translator, /targetLanguage,\s*regionalVariant: regionalVariant \|\| null,\s*page: 1/);
  assert.doesNotMatch(translator, /words your family already uses/i);
});

test("multilingual Refrain Lab prompt and validator share the three-construction contract", () => {
  const texts = MULTILINGUAL_EVALUATION_FIXTURES
    .filter((fixture) => fixture.sourceBook === "I Love You So Mush")
    .map((fixture) => fixture.source);
  const prompt = directionsEvaluationPrompt({
    texts,
    visualContexts: ["tree friend", "spinning friends", "jelly fungi"],
    priority: "rhythm",
    freedom: "natural",
    targetLanguage: "es",
    regionalVariant: "es-ES",
    directionsJson: "{\"candidates\":[]}",
    refrainBudget: deriveRefrainBudget(texts)
  });
  assert.match(
    prompt,
    /exactly one finalist with construction "couplet", exactly one with construction "playful_hook", and exactly one with construction "lyrical_refrain"/
  );

  const option = (construction: "couplet" | "playful_hook" | "lyrical_refrain", index: number) => ({
    sourceCandidateIndex: index,
    label: `Option ${index + 1}`,
    refrain: [
      "Con cariño y emoción, te lo dice este champiñón.",
      "¡Seta, seta, qué ilusión; te queremos un montón!",
      "Qué alegría tu compañía; llenas de luz cada día."
    ][index],
    description: "Mock editorial fixture.",
    genderDependency: "None.",
    construction,
    rhymePairs: [{ endingA: "emoción", endingB: "champiñón" }]
  });
  const valid = [
    option("couplet", 0),
    option("playful_hook", 1),
    option("lyrical_refrain", 2)
  ];
  const duplicateAndMissing = [
    option("playful_hook", 0),
    option("lyrical_refrain", 1),
    option("lyrical_refrain", 2)
  ];
  const budget = deriveRefrainBudget(texts);
  assert.equal(
    validateFinalEditorialSet(valid, budget, true, 5, "es").hardFailures.length,
    0
  );
  assert.ok(
    validateFinalEditorialSet(duplicateAndMissing, budget, true, 5, "es")
      .hardFailures.some((issue) => issue.code === "CONSTRUCTION_SCHEMA_INVARIANT")
  );
});
