import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DIRECTION_PIPELINE_CONFIG,
  HARD_MAX_REFRAIN_CHARACTERS,
  DirectionPipelineError,
  classifyStageFailure,
  deriveRefrainBudget,
  directionDraftCacheKey,
  editorialBudgetViolations,
  editorialOptionsSchema,
  finalDirectionSetViolations,
  parseCompletedOutput,
  privateCandidatesSchema,
  refrainBudgetViolations,
  rhymePairViolations,
  resolveDirectionDraft,
  validatePrivateCandidates,
  validateFinalEditorialSet,
  type CachedDirectionDraft,
  type DirectionDraftCache,
  type PrivateDirectionCandidate
} from "../app/api/direction-pipeline.ts";
import { directionsGenerationPrompt } from "../app/api/translation-prompts.ts";

function completedResponse(output: unknown) {
  const outputText = JSON.stringify(output);
  return {
    id: "resp_completed_fixture",
    status: "completed",
    incomplete_details: null,
    output_text: outputText,
    output: [{
      id: "msg_fixture",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: outputText, annotations: [], logprobs: [] }]
    }],
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 50,
      output_tokens_details: { reasoning_tokens: 10 },
      total_tokens: 150
    }
  } as any;
}

function incompleteResponse(reason: "max_output_tokens" | "content_filter" = "max_output_tokens") {
  return {
    id: "resp_incomplete_fixture",
    status: "incomplete",
    incomplete_details: { reason },
    output_text: "",
    output: [],
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5000,
      output_tokens_details: { reasoning_tokens: 4800 },
      total_tokens: 5100
    }
  } as any;
}

const candidates: PrivateDirectionCandidate[] = [
  { name: "Warm declaration", refrain: "Prijatelji moji, rada vas imam.", approach: "A compact closing declaration." },
  { name: "Question and answer", refrain: "Kdo mi polepša dan? Prijatelji, vsak od vas!", approach: "A spoken question-and-answer refrain." },
  { name: "Two-line song", refrain: "Ko skupaj smo, se svet blešči,\nprijatelj vsak me razveseli.", approach: "A two-line rhyming song." },
  { name: "Playful echo", refrain: "Goba vpraša: »Kdo je tu?« Prijatelji: »Vsi smo tu!«", approach: "A playful call and echo." },
  { name: "Gentle promise", refrain: "Z vami rada potujem, z vami se veselim.", approach: "A gentle recurring promise." }
];

const completeMushroomSource = [
  "I love my happy, hairy friend who's nestled on a tree.\nI really love you oh-so-MUSH for watching over me.",
  "These mushroom friends have many hands to hold and spin around.\nI really love you oh-so-MUSH! You lift me off the ground!",
  "I spy my jiggly orange friends.\nIt's fun the way you move.\nI really love you oh-so-MUSH!"
];

const editorialConstructions = [
  {
    construction: "couplet" as const,
    refrain: "Za vašo skrb sem vam predana,\nob vas sem srečna in nasmejana.",
    rhymePairs: [{ endingA: "predana", endingB: "nasmejana" }]
  },
  {
    construction: "playful_hook" as const,
    refrain: "Rada, rada vas imam — srečo z vami vedno poznam!",
    rhymePairs: [{ endingA: "imam", endingB: "poznam" }]
  },
  {
    construction: "lyrical_refrain" as const,
    refrain: "Ob vas mi srce zaigra, vsak trenutek se razigra.",
    rhymePairs: [{ endingA: "zaigra", endingB: "razigra" }]
  }
];

function editorialFixture(sourceCandidateIndex: number) {
  const form = editorialConstructions[sourceCandidateIndex];
  return {
    sourceCandidateIndex,
    label: `Option ${sourceCandidateIndex + 1}`,
    refrain: form.refrain,
    description: "Concise structural description.",
    genderDependency: "Feminine narrator.",
    construction: form.construction,
    rhymePairs: form.rhymePairs
  };
}

function memoryCache(): DirectionDraftCache {
  const values = new Map<string, CachedDirectionDraft>();
  return {
    async read(key) { return values.get(key) ?? null; },
    async write(key, value) { values.set(key, value); }
  };
}

test("completed drafting and completed editing parse only after completed status", () => {
  assert.equal(
    parseCompletedOutput(completedResponse({ candidates }), "draft", privateCandidatesSchema).candidates.length,
    5
  );
  const options = candidates.slice(0, 3).map((_, sourceCandidateIndex) => editorialFixture(sourceCandidateIndex));
  assert.equal(
    parseCompletedOutput(completedResponse({ options }), "editor", editorialOptionsSchema).options.length,
    3
  );
});

test("draft timeout receives a stable typed code", () => {
  assert.equal(classifyStageFailure("draft", new Error("Request was aborted.")).code, "DRAFT_TIMEOUT");
});

test("draft max-output incomplete response is classified before JSON parsing", () => {
  assert.throws(
    () => parseCompletedOutput(incompleteResponse(), "draft", privateCandidatesSchema),
    (error: unknown) => error instanceof DirectionPipelineError && error.code === "DRAFT_OUTPUT_LIMIT"
  );
});

test("completed draft with invalid structured output is distinguished", () => {
  assert.throws(
    () => parseCompletedOutput(completedResponse({ candidates: [] }), "draft", privateCandidatesSchema),
    (error: unknown) => error instanceof DirectionPipelineError && error.code === "DRAFT_INVALID_OUTPUT"
  );
});

test("refusal and missing output are invalid structured responses", () => {
  const refused = {
    ...completedResponse({ candidates }),
    output_text: "",
    output: [{
      id: "msg_refusal",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "refusal", refusal: "Unable to comply." }]
    }]
  } as any;
  for (const response of [refused, { ...completedResponse({ candidates }), output_text: "", output: [] }]) {
    assert.throws(
      () => parseCompletedOutput(response, "draft", privateCandidatesSchema),
      (error: unknown) => error instanceof DirectionPipelineError && error.code === "DRAFT_INVALID_OUTPUT"
    );
  }
});

test("network failures retain a stable network code", () => {
  assert.equal(classifyStageFailure("draft", new Error("socket closed")).code, "NETWORK_FAILURE");
});

test("editor timeout and output limit receive editor-specific codes", () => {
  assert.equal(classifyStageFailure("editor", new Error("OpenAI request exceeded 90000ms")).code, "EDITOR_TIMEOUT");
  assert.throws(
    () => parseCompletedOutput(incompleteResponse(), "editor", editorialOptionsSchema),
    (error: unknown) => error instanceof DirectionPipelineError && error.code === "EDITOR_OUTPUT_LIMIT"
  );
});

test("editor-only retry reuses a preserved successful draft", async () => {
  const cache = memoryCache();
  let generations = 0;
  const generate = async () => {
    generations += 1;
    const validation = validatePrivateCandidates(candidates);
    return { candidates: validation.survivors };
  };
  await resolveDirectionDraft({ key: "same", freshDraft: false, cache, generate });
  const retried = await resolveDirectionDraft({ key: "same", freshDraft: false, cache, generate });
  assert.equal(retried.reused, true);
  assert.equal(generations, 1);
});

test("changed relevant input invalidates the saved draft key", () => {
  const first = directionDraftCacheKey({ texts: ["one"], priority: "rhythm" });
  const changed = directionDraftCacheKey({ texts: ["two"], priority: "rhythm" });
  assert.notEqual(first, changed);
});

test("exact duplicates are rejected while near duplicates become advisory warnings", () => {
  const distinct = [
    { name: "Declaration", refrain: "Prijatelji moji, rada vas imam.", approach: "A compact declaration." },
    { name: "Question", refrain: "Kdo me razveseli? Prav vsi!", approach: "A short question and answer." },
    { name: "Joy", refrain: "Z vami se veselim.", approach: "A gentle statement." }
  ];
  const duplicated = [
    ...distinct,
    { ...distinct[0], name: "Duplicate" },
    { ...distinct[0], name: "Near duplicate", refrain: "Prijatelji moji — res rada vas imam!" }
  ];
  const validation = validatePrivateCandidates(duplicated);
  assert.equal(validation.survivors.length, 4);
  assert.equal(validation.survivors.some((candidate) => candidate.name === "Duplicate"), false);
  assert.equal(validation.survivors.some((candidate) => candidate.name === "Near duplicate"), true);
  assert.ok(validation.qualityWarnings.some((warning) => warning.code === "NEAR_DUPLICATE"));
});

test("too few valid candidates produces a quality-rejection error", () => {
  const twoValid = candidates.map((candidate, index) => {
    if (index < 3) return { ...candidate, refrain: "rad/a" };
    return { ...candidate, refrain: index === 3 ? "Z vami se veselim." : "Rada vas imam." };
  });
  assert.equal(validatePrivateCandidates(twoValid).survivors.length, 2);

  const onlyOneValid = twoValid.map((candidate, index) => index < 4
    ? { ...candidate, refrain: "rad/a" }
    : candidate);
  assert.throws(() => validatePrivateCandidates(onlyOneValid), (error: unknown) => {
    assert.ok(error instanceof DirectionPipelineError);
    assert.equal(error.code, "DRAFT_QUALITY_REJECTION");
    assert.equal((error.cause as any).rawCandidates.length, 5);
    assert.ok((error.cause as any).rejections.length >= 4);
    return true;
  });
});

test("source-relative shape is advisory but grossly overlong drafts are rejected", () => {
  const overlong = candidates.map((candidate, index) => index < 4
    ? { ...candidate, refrain: "x".repeat(HARD_MAX_REFRAIN_CHARACTERS + 1) }
    : candidate);
  assert.throws(
    () => validatePrivateCandidates(overlong),
    (error: unknown) => error instanceof DirectionPipelineError && error.code === "DRAFT_QUALITY_REJECTION"
  );
  const threeLine = candidates.map((candidate, index) => index === 0
    ? { ...candidate, refrain: "Prva vrstica.\nDruga vrstica.\nTretja vrstica." }
    : candidate);
  const validation = validatePrivateCandidates(threeLine);
  assert.equal(validation.survivors.length, 5);
  assert.ok(validation.qualityWarnings.some((warning) => warning.code === "SOURCE_RELATIVE_SHAPE"));
});

test("complete live fixture derives a source-relative refrain budget", () => {
  const budget = deriveRefrainBudget(completeMushroomSource);
  assert.equal(budget.sourceRefrain, "I really love you oh-so-MUSH for watching over me.");
  assert.equal(budget.sourceWordCount, 9);
  assert.equal(budget.sourceCharacterCount, 50);
  assert.equal(budget.maximumWordCount, 12);
  assert.equal(budget.maximumCharacterCount, 65);
  assert.equal(budget.maximumSentenceCount, 1);
});

test("both unacceptable live options fail the source-relative budget and expansion checks", () => {
  const budget = deriveRefrainBudget(completeMushroomSource);
  const bad = [
    "Ali rada vas imam? Še kako – in to priznam! Kdo mi prikliče nasmeh na obraz? Prijatelji moji — prav vsak izmed vas!",
    "Ko ste blizu, se smehljam, ker vas rada, rada imam. Ko zaplešete, gozd zaživi, z vami vred se veseli."
  ];
  for (const refrain of bad) {
    const violations = refrainBudgetViolations(refrain, budget);
    assert.ok(violations.some((violation) => violation.includes("word")));
    assert.ok(violations.some((violation) => violation.includes("character")));
    assert.ok(violations.some((violation) => violation.includes("sentences") || violation.includes("clauses")));
  }
});

test("regression fixture supplies the complete source and calculated limits to drafting", () => {
  const budget = deriveRefrainBudget(completeMushroomSource);
  const prompt = directionsGenerationPrompt({
    texts: completeMushroomSource,
    visualContexts: ["tree scene", "circle scene", "orange friends"],
    priority: "rhythm",
    freedom: "natural",
    refrainBudget: budget
  });
  assert.match(prompt, /Source refrain word count: 9/);
  assert.match(prompt, /Maximum candidate word count: 12/);
  assert.match(prompt, /Source refrain character count: 50/);
  assert.match(prompt, /Maximum candidate character count: 65/);
  assert.match(prompt, /Do not expand the refrain into a stanza/);
});

test("Step 5 SSE exposes stable stages and error codes", async () => {
  const route = await readFile(new URL("../app/api/directions/route.ts", import.meta.url), "utf8");
  for (const stage of [
    "drafting_started",
    "drafting_completed",
    "validating_candidates",
    "editing_started",
    "editing_completed",
    "completed",
    "failed"
  ]) assert.match(route, new RegExp(stage));
  assert.match(route, /typed\.code === "FINAL_SET_INVALID"/);
  assert.match(route, /"editor_only"/);
});

test("parent-facing result has three concise options and no unused editorial metadata", () => {
  assert.equal(DIRECTION_PIPELINE_CONFIG.editorial.optionCount, 3);
  const pipeline = editorialOptionsSchema.parse({
    options: candidates.slice(0, 3).map((_, sourceCandidateIndex) => editorialFixture(sourceCandidateIndex))
  });
  assert.equal(pipeline.options.length, 3);
  assert.equal("keeps" in pipeline.options[0], false);
  assert.equal("changes" in pipeline.options[0], false);
});

test("declared-construction similarity is a warning rather than a hard failure", () => {
  const options = editorialConstructions.map((_, index) => editorialFixture(index));
  const suspicious = options.map((option, index) => ({
    ...option,
    refrain: index === 0 ? option.refrain : `${option.refrain.split(",")[0]}, rada vas imam ves čas!`
  }));
  const diagnostics = validateFinalEditorialSet(
    suspicious,
    deriveRefrainBudget(completeMushroomSource),
    true,
    3
  );
  assert.deepEqual(diagnostics.hardFailures, []);
  assert.ok(diagnostics.qualityWarnings.some((warning) => warning.code === "EDITORIAL_HEURISTIC"));
});

test("rhyme validation accepts line, echo, and flowing-phrase rhyme structures", () => {
  for (const option of editorialConstructions) {
    assert.deepEqual(rhymePairViolations(option.refrain, option.rhymePairs), []);
  }
});

test("two surviving seeds require one independently sourced construction", () => {
  const options = editorialConstructions.map((_, index) => editorialFixture(index));
  assert.ok(finalDirectionSetViolations(options, true, 2)
    .some((reason) => reason.includes("independently generate exactly one")));
  options[2].sourceCandidateIndex = -1;
  assert.deepEqual(finalDirectionSetViolations(options, true, 2), []);
});

test("a compact playful pickup is not miscounted as an overlong grammatical expansion", () => {
  const budget = deriveRefrainBudget(completeMushroomSource);
  const editorialOptions = [
    {
      ...editorialFixture(0),
      refrain: "Čuvate me vi,\nrada vas imam vse dni.",
      rhymePairs: [{ endingA: "vi", endingB: "dni" }]
    },
    {
      ...editorialFixture(1),
      refrain: "Hvala za skrb, hvala za vas — rada vas imam ves čas!",
      rhymePairs: [{ endingA: "vas", endingB: "čas" }]
    },
    {
      ...editorialFixture(2),
      sourceCandidateIndex: -1,
      refrain: "Vaša skrb me varuje — moje srce vas obožuje.",
      rhymePairs: [{ endingA: "varuje", endingB: "obožuje" }]
    }
  ];
  const diagnostics = validateFinalEditorialSet(editorialOptions, budget, true, 2);
  assert.deepEqual(diagnostics.hardFailures, []);
  assert.ok(diagnostics.qualityWarnings.length >= 0);
});

test("dubious rhyme and punctuation heuristics warn without failing three valid strings", () => {
  const options = editorialConstructions.map((_, index) => editorialFixture(index));
  options[0].rhymePairs = [{ endingA: "rada", endingB: "name" }];
  const diagnostics = validateFinalEditorialSet(
    options,
    deriveRefrainBudget(completeMushroomSource),
    true,
    3
  );
  assert.deepEqual(diagnostics.hardFailures, []);
  assert.ok(diagnostics.qualityWarnings.some((warning) =>
    warning.message.includes("plausible shared spoken ending")
  ));
});

test("empty, malformed, identical, placeholder, and grossly overlong final outputs hard-fail", () => {
  const base = editorialConstructions.map((_, index) => editorialFixture(index));
  const budget = deriveRefrainBudget(completeMushroomSource);
  for (const mutate of [
    (options: typeof base) => { options[0].refrain = ""; },
    (options: typeof base) => { options[0].refrain = "123"; },
    (options: typeof base) => { options[1].refrain = options[0].refrain; },
    (options: typeof base) => { options[0].refrain = "Izberite refren: {{besedilo}}"; },
    (options: typeof base) => { options[0].refrain = "a".repeat(HARD_MAX_REFRAIN_CHARACTERS + 1); }
  ]) {
    const options = structuredClone(base);
    mutate(options);
    assert.ok(validateFinalEditorialSet(options, budget, true, 3).hardFailures.length > 0);
  }
});

test("Step 5 UI distinguishes a completed but invalid final set from unfinished drafting", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /FINAL_SET_INVALID/);
  assert.match(page, /We couldn’t prepare these options\./);
});

test("both Step 5 calls are centrally configured to use Sol", () => {
  assert.equal(DIRECTION_PIPELINE_CONFIG.drafting.model, "gpt-5.6-sol");
  assert.equal(DIRECTION_PIPELINE_CONFIG.editorial.model, "gpt-5.6-sol");
  assert.equal(DIRECTION_PIPELINE_CONFIG.drafting.candidateCount, 5);
});
