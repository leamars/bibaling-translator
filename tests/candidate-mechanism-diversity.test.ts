import test from "node:test";
import assert from "node:assert/strict";
import {
  directionsEvaluationPrompt,
  directionsGenerationPrompt,
  translationEvaluationPrompt,
  translationGenerationPrompt
} from "../app/api/translation-prompts.ts";

const source = "My bright red kite climbs over the hill. Come fly with me!";
const refrain = "Come fly with me!";

function refrainLabPrompts(targetLanguage: "sl" | "hr") {
  const common = {
    texts: [source, `The kite dips toward the trees. ${refrain}`, `It lands beside us. ${refrain}`],
    visualContexts: ["A red kite rises.", "The kite passes trees.", "Two children catch it."],
    priority: "rhythm" as const,
    freedom: "natural" as const,
    targetLanguage
  };
  return {
    draft: directionsGenerationPrompt(common),
    editorial: directionsEvaluationPrompt({
      ...common,
      directionsJson: JSON.stringify({ candidates: [] })
    })
  };
}

function pagePrompts(bookForm: "refrain_verse" | "prose_story", targetLanguage: "sl" | "hr") {
  const direction = bookForm === "refrain_verse"
    ? {
        name: "Flying refrain",
        refrain: "Poleti z menoj!",
        approach: "A compact recurring invitation.",
        genderDependency: "None"
      }
    : undefined;
  const common = {
    spreadNumber: 1,
    source,
    visualContext: "A child flies a red kite over a grassy hill.",
    priority: bookForm === "prose_story" ? "meaning" as const : "rhythm" as const,
    freedom: "natural" as const,
    bookForm,
    sourceRhyme: bookForm === "prose_story" ? "none" as const : "sustained" as const,
    direction,
    targetLanguage
  };
  return {
    draft: translationGenerationPrompt(common),
    editorial: translationEvaluationPrompt({
      ...common,
      candidatesJson: JSON.stringify({ candidates: [] })
    })
  };
}

test("Refrain Lab drafting and editorial prompts require mechanism-level diversity", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const { draft, editorial } = refrainLabPrompts(targetLanguage);
    assert.match(draft, /at least four materially different, source-grounded refrain or wordplay mechanisms/i);
    assert.match(draft, /No more than two candidates may use the same coined adjective\/adverb mechanism/i);
    assert.match(draft, /strategy label must name the actual linguistic mechanism/i);
    assert.match(draft, /Synonym swaps, reordered clauses, and small intensifier additions/i);
    assert.match(editorial, /three surface rewrites of one central joke/i);
    assert.match(editorial, /materially different mechanisms/i);
  }
});

test("page generation protects a locked refrain and varies only non-locked writing", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const { draft, editorial } = pagePrompts("refrain_verse", targetLanguage);
    for (const prompt of [draft, editorial]) {
      assert.match(prompt, /approved refrain is locked text|exact approved refrain/i);
      assert.match(prompt, /must never alter, paraphrase, or replace it|Never create diversity by changing or paraphrasing its wording/i);
      assert.match(prompt, /natural sentence shape/);
      assert.match(prompt, /pacing and line division/);
      assert.doesNotMatch(prompt, /at least four materially different/);
      assert.doesNotMatch(prompt, /different refrain mechanisms/);
    }
  }
});

test("prose uses source-grounded approaches without demanding literary invention", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const { draft, editorial } = pagePrompts("prose_story", targetLanguage);
    assert.match(draft, /source-grounded translation approaches/i);
    assert.match(draft, /Do not demand or invent wordplay, refrain mechanisms, puns, imagery, rhyme, or literary devices absent from the source/i);
    assert.match(editorial, /do not invent a refrain, pun, image, or literary device absent from the source/i);
    assert.doesNotMatch(draft, /at least four materially different/);
  }
});

test("unrelated multilingual sources receive no mushroom-specific diversity examples", () => {
  const prompts = [
    ...Object.values(refrainLabPrompts("hr")),
    ...Object.values(pagePrompts("refrain_verse", "hr")),
    ...Object.values(pagePrompts("prose_story", "hr"))
  ];
  for (const prompt of prompts) {
    assert.doesNotMatch(prompt, /mushroom-ly|mushroom-part imagery|mushroom adjective|gljivasto/i);
  }
});

test("quality remains more important than diversity", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const prompts = [
      ...Object.values(refrainLabPrompts(targetLanguage)),
      ...Object.values(pagePrompts("refrain_verse", targetLanguage))
    ];
    assert.ok(prompts.some((prompt) => /Translation quality remains the first requirement/i.test(prompt)));
    assert.ok(prompts.some((prompt) => /Translation quality outranks diversity/i.test(prompt)));
    for (const prompt of prompts.filter((item) => /FINALIST DIVERSITY/i.test(item))) {
      assert.match(prompt, /Never promote an awkward, less faithful, less natural, or otherwise lower-quality text solely to create variety/i);
    }
  }
});

test("a diversity warning is appended to qualityNote without replacing substantive weakness", () => {
  for (const targetLanguage of ["sl", "hr"] as const) {
    const editorialPrompts = [
      refrainLabPrompts(targetLanguage).editorial,
      pagePrompts("refrain_verse", targetLanguage).editorial
    ];
    for (const prompt of editorialPrompts) {
      assert.match(prompt, /CANDIDATE_DIVERSITY_WARNING:/);
      assert.match(prompt, /qualityNote/);
      assert.match(prompt, /Preserve each finalist's substantive weakness unchanged|preserving the finalist's substantive weakness unchanged/i);
      assert.doesNotMatch(prompt, /prefix .* in the weakness/i);
    }
  }
});
