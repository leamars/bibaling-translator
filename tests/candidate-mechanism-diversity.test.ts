import test from "node:test";
import assert from "node:assert/strict";
import {
  translationEvaluationPrompt,
  translationGenerationPrompt
} from "../app/api/translation-prompts.ts";

const base = {
  spreadNumber: 1,
  source: "I really love you oh-so-MUSH for watching over me.",
  visualContext: "A mushroom watches over a friend.",
  priority: "rhythm" as const,
  freedom: "natural" as const,
  bookForm: "refrain_verse" as const,
  sourceRhyme: "sustained" as const,
  direction: {
    name: "Mushroom refrain",
    refrain: "A parent-approved refrain.",
    approach: "Recurring affection",
    genderDependency: "None"
  }
};

function renderedPrompts(targetLanguage: "sl" | "hr") {
  const language = { targetLanguage };
  return {
    draft: translationGenerationPrompt({ ...base, ...language }),
    editorial: translationEvaluationPrompt({
      ...base,
      ...language,
      candidatesJson: JSON.stringify({ candidates: [] })
    })
  };
}

test("production drafting prompts require mechanism-level candidate diversity", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const { draft } = renderedPrompts(targetLanguage);
    assert.match(draft, /at least four materially different refrain, wordplay, or literary mechanisms/i);
    assert.match(draft, /No more than two candidates may use the same coined adjective\/adverb mechanism/i);
    assert.match(draft, /strategy label must name the actual linguistic mechanism/i);
    assert.match(draft, /mushroom-part imagery/);
    assert.match(draft, /natural target-language idiom/);
    assert.match(draft, /affectionate refrain without mushroom coinage/);
    assert.match(draft, /sound-based wordplay/);
    assert.match(draft, /compact call-and-response/);
    assert.match(draft, /source-grounded semantic pun/);
  }
});

test("production prompts do not count three surface rewrites as meaningful diversity", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const { draft, editorial } = renderedPrompts(targetLanguage);
    for (const prompt of [draft, editorial]) {
      assert.match(prompt, /Synonym swaps, reordered clauses, and small intensifier additions/i);
      assert.match(prompt, /do not (?:count as|establish) mechanism-level diversity|do not count as materially different mechanisms/i);
    }
    assert.match(editorial, /three surface rewrites of one central joke/i);
    assert.match(editorial, /CANDIDATE_DIVERSITY_WARNING:/);
  }
});

test("production editorial prompts keep translation quality above variety", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const { draft, editorial } = renderedPrompts(targetLanguage);
    assert.match(draft, /Translation quality remains the first requirement/i);
    assert.match(editorial, /Translation quality outranks diversity/i);
    assert.match(editorial, /Never promote an awkward, less faithful, less natural, or otherwise lower-quality text solely to create variety/i);
    assert.match(editorial, /If three strong distinct mechanisms do not exist, return the strongest qualifying texts/i);
    assert.match(editorial, /Do not pretend they are meaningfully different/i);
  }
});
