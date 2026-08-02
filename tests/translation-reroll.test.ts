import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  translationEvaluationPrompt,
  translationGenerationPrompt
} from "../app/api/translation-prompts.ts";

const shared = {
  spreadNumber: 1,
  source: "Llama llama red pajama reads a story with his mama.",
  visualContext: "A llama reads with his mother.",
  priority: "rhythm" as const,
  freedom: "playful" as const,
  bookForm: "continuous_verse" as const,
  sourceRhyme: "sustained" as const,
  targetLanguage: "de" as const,
  previousOptions: [
    "Das kleine Lama im roten Pyjama liest eine Geschichte mit seiner Mama.",
    "Im roten Pyjama liest das kleine Lama eine Geschichte mit seiner Mama."
  ]
};

test("a re-roll tells both German generation and editorial passes to avoid the previous set", () => {
  const generation = translationGenerationPrompt(shared);
  const evaluation = translationEvaluationPrompt({
    ...shared,
    candidatesJson: JSON.stringify([{ id: "c01", strategy: "new", text: "Lama Lama im Pyjama liest ein Buch mit seiner Mama." }])
  });

  for (const prompt of [generation, evaluation]) {
    assert.match(prompt, /PREVIOUSLY SHOWN TRANSLATIONS/);
    assert.match(prompt, /Das kleine Lama im roten Pyjama/);
    assert.match(prompt, /do not repeat|none may return/i);
  }
});

test("the Page 1 review exposes a candidate re-roll and sends the previous options", async () => {
  const [translator, route] = await Promise.all([
    readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8")
  ]);

  assert.match(translator, /Re-roll three new options/);
  assert.match(translator, /writeSpread1\(lockedDirection \?\? undefined, previousOptions\)/);
  assert.match(route, /previousOptions: z\.array/);
  assert.match(route, /previousOptions: input\.previousOptions/);
  assert.match(route, /previousOptionTexts\.has\(normalized\)/);
});
