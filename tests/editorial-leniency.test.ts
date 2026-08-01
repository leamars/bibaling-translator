import assert from "node:assert/strict";
import test from "node:test";
import {
  finalistMetadataWarnings,
  normalizeRecommendedFinalist,
  type ProductionFinalist
} from "../app/api/editorial-contract.ts";
import {
  deriveRefrainBudget,
  productionDirectionResultSchema,
  selectProductionRecommendedDirection,
  validateProductionDirectionResult
} from "../app/api/direction-pipeline.ts";
import {
  productionPageEditorialResultSchema,
  resolveProductionPageResult
} from "../app/api/page-editorial-contract.ts";
import { failedFullBookGates } from "../app/api/translation-quality.ts";

const sourceTexts = [
  "I love my happy, hairy friend who's nestled on a tree.\nI really love you oh-so-MUSH for watching over me.",
  "These mushroom friends have many hands to hold and spin around.\nI really love you oh-so-MUSH! You lift me off the ground!",
  "I spy my jiggly orange friends.\nIt's fun the way you move.\nI really love you oh-so-MUSH!"
];

function productionFinalist(rank: number, overrides: Partial<ProductionFinalist> = {}): ProductionFinalist {
  return {
    rank,
    recommendedFinalist: rank === 1,
    strength: "Preserves the source action in a clear child-friendly structure.",
    weakness: "The closing phrase is less vivid than the strongest alternative.",
    qualityNote: "The endings imam/poznam form an audible spoken rhyme.",
    fidelityPass: true,
    grammarPass: true,
    readAloudPass: true,
    directionPass: true,
    rhymePass: true,
    ...overrides
  };
}

function directionOption(index: number, overrides: Record<string, unknown> = {}) {
  const constructions = ["couplet", "playful_hook", "lyrical_refrain"] as const;
  const refrains = [
    "Za vašo skrb sem vam predana,\nob vas sem srečna in nasmejana.",
    "Rada, rada vas imam — srečo z vami vedno poznam!",
    "Ob vas mi srce zaigra, vsak trenutek se razigra."
  ];
  const rhymePairs = [
    [{ endingA: "predana", endingB: "nasmejana" }],
    [{ endingA: "imam", endingB: "poznam" }],
    [{ endingA: "zaigra", endingB: "razigra" }]
  ];
  return {
    sourceCandidateIndex: index,
    label: `Option ${index + 1}`,
    refrain: refrains[index],
    description: "Concise structural description.",
    genderDependency: "Feminine narrator.",
    construction: constructions[index],
    rhymePairs: rhymePairs[index],
    ...productionFinalist(index + 1),
    ...overrides
  };
}

test("usable candidate text survives imperfect recommendation and rank metadata", () => {
  // Editor forgot to flag any recommendation and duplicated a rank.
  const finalists = [
    productionFinalist(1, { recommendedFinalist: false }),
    productionFinalist(1, { recommendedFinalist: false }),
    productionFinalist(3, { recommendedFinalist: false })
  ];
  const selection = normalizeRecommendedFinalist({ finalists, rhymeRequired: true });
  assert.equal(selection.ok, true);
  if (selection.ok) {
    assert.equal(selection.finalist.rank, 1);
    assert.ok(selection.warnings.some((warning) => warning.code === "RANK_METADATA_IMPERFECT"));
    assert.ok(selection.warnings.some((warning) => warning.code === "RECOMMENDATION_METADATA_IMPERFECT"));
  }
});

test("an explicit unique recommendation is honored even when its rank is imperfect", () => {
  const finalists = [
    productionFinalist(1, { recommendedFinalist: false }),
    productionFinalist(2, { recommendedFinalist: true }),
    productionFinalist(3, { recommendedFinalist: false })
  ];
  const selection = normalizeRecommendedFinalist({ finalists, rhymeRequired: true });
  assert.equal(selection.ok, true);
  if (selection.ok) {
    assert.equal(selection.finalist.rank, 2);
    assert.ok(selection.warnings.some((warning) => warning.code === "RECOMMENDATION_NORMALIZED"));
  }
});

test("an ineligible recommendation falls back to the best qualifying finalist", () => {
  const finalists = [
    productionFinalist(1, { recommendedFinalist: true, grammarPass: false }),
    productionFinalist(2, { recommendedFinalist: false }),
    productionFinalist(3, { recommendedFinalist: false })
  ];
  const selection = normalizeRecommendedFinalist({ finalists, rhymeRequired: true });
  assert.equal(selection.ok, true);
  if (selection.ok) assert.equal(selection.finalist.rank, 2);
});

test("only translation-level gate failures reject the whole result", () => {
  const finalists = [1, 2, 3].map((rank) => productionFinalist(rank, { fidelityPass: false }));
  const selection = normalizeRecommendedFinalist({ finalists, rhymeRequired: true });
  assert.equal(selection.ok, false);
  if (!selection.ok) assert.equal(selection.error.code, "NO_QUALIFYING_FINALIST");
});

test("missing comparison paperwork produces warnings rather than FINAL_SET_INVALID hard failures", () => {
  const result = productionDirectionResultSchema.parse({
    options: [
      directionOption(0, { recommendedFinalist: false }),
      directionOption(1, { rank: 1, recommendedFinalist: false }),
      directionOption(2, { recommendedFinalist: false })
    ]
  });
  const diagnostics = validateProductionDirectionResult(
    result,
    deriveRefrainBudget(sourceTexts),
    true,
    3,
    "sl"
  );
  assert.deepEqual(diagnostics.hardFailures, []);
  assert.ok(diagnostics.qualityWarnings.length > 0);
  const selection = selectProductionRecommendedDirection(result, true);
  assert.equal(selection.ok, true);
});

test("short or empty strength/weakness values parse, warn, and leave gate-passing candidates eligible", () => {
  // Directions production schema: the keys are required but carry no length
  // minimum, so an editor that phones in its assessments cannot break the
  // structured response.
  const directions = productionDirectionResultSchema.parse({
    options: [
      directionOption(0, { strength: "", weakness: "" }),
      directionOption(1, { strength: "Nice.", weakness: "Meh." }),
      directionOption(2)
    ]
  });
  assert.equal(directions.options.length, 3);

  // Page production schema accepts the same degraded metadata.
  const page = productionPageEditorialResultSchema.parse({
    finalists: ["c01", "c02", "c03"].map((id, index) => ({
      sourceCandidateId: id,
      text: `Besedilo možnosti ${index + 1}, ki ga starš lahko prebere.`,
      ...productionFinalist(index + 1, index === 0 ? { strength: "", weakness: "Ok." } : {})
    }))
  });
  assert.equal(page.finalists.length, 3);

  // The degraded assessments surface as metadata warnings...
  const warnings = finalistMetadataWarnings(directions.options, true);
  assert.ok(warnings.filter((warning) => warning.code === "GENERIC_ASSESSMENT").length >= 4);

  // ...and the candidates stay eligible and selectable while their
  // translation gates pass.
  const directionSelection = selectProductionRecommendedDirection(directions, true);
  assert.equal(directionSelection.ok, true);
  if (directionSelection.ok) assert.equal(directionSelection.finalist.rank, 1);
  const pageSelection = resolveProductionPageResult({
    result: page,
    rhymeRequired: true,
    sourceCandidates: [
      { id: "c01", text: "one" },
      { id: "c02", text: "two" },
      { id: "c03", text: "three" }
    ]
  });
  assert.equal(pageSelection.ok, true);
  if (pageSelection.ok) assert.equal(pageSelection.recommended.rank, 1);
});

test("generic strengths and rhyme-note gaps are warnings, never rejections", () => {
  const warnings = finalistMetadataWarnings([
    productionFinalist(1, { strength: "Great.", qualityNote: "" }),
    productionFinalist(2),
    productionFinalist(3)
  ], true);
  assert.ok(warnings.some((warning) => warning.code === "GENERIC_ASSESSMENT"));
  assert.ok(warnings.some((warning) => warning.code === "RHYME_NOTE_MISSING"));
});

test("spelling-level rhyme heuristics warn without hard-rejecting production directions", () => {
  const result = productionDirectionResultSchema.parse({
    options: [
      // "rada"/"name" share no plausible written ending — the heuristic must
      // not treat that spelling judgment as proof of a failed rhyme.
      directionOption(0, { rhymePairs: [{ endingA: "rada", endingB: "name" }] }),
      directionOption(1),
      directionOption(2)
    ]
  });
  const diagnostics = validateProductionDirectionResult(
    result,
    deriveRefrainBudget(sourceTexts),
    true,
    3,
    "sl"
  );
  assert.deepEqual(diagnostics.hardFailures, []);
  assert.ok(diagnostics.qualityWarnings.some((warning) =>
    warning.message.includes("plausible shared spoken ending")
  ));
});

test("an imperfect construction mix is a warning while unusable text still hard-fails", () => {
  const budget = deriveRefrainBudget(sourceTexts);
  const twoCouplets = productionDirectionResultSchema.parse({
    options: [
      directionOption(0),
      directionOption(1, { construction: "couplet" }),
      directionOption(2)
    ]
  });
  const mixDiagnostics = validateProductionDirectionResult(twoCouplets, budget, true, 3, "sl");
  assert.deepEqual(mixDiagnostics.hardFailures, []);
  assert.ok(mixDiagnostics.qualityWarnings.some((warning) => warning.code === "CONSTRUCTION_SCHEMA_INVARIANT"));

  const placeholderText = productionDirectionResultSchema.parse({
    options: [
      directionOption(0, { refrain: "Izberite refren: {{besedilo}}" }),
      directionOption(1),
      directionOption(2)
    ]
  });
  assert.ok(validateProductionDirectionResult(placeholderText, budget, true, 3, "sl").hardFailures.length > 0);

  const duplicateText = productionDirectionResultSchema.parse({
    options: [
      directionOption(0),
      directionOption(1, { refrain: directionOption(0).refrain as string }),
      directionOption(2)
    ]
  });
  assert.ok(validateProductionDirectionResult(duplicateText, budget, true, 3, "sl").hardFailures
    .some((issue) => issue.code === "EXACT_DUPLICATE"));
});

test("page finalists survive provenance gaps and normalize the recommendation", () => {
  const result = productionPageEditorialResultSchema.parse({
    finalists: [
      {
        sourceCandidateId: "c09", // unknown id — provenance warning, not failure
        text: "Prijatelj moj na drevesu spi, ob njem se dan lepo vrti.",
        ...productionFinalist(1, { recommendedFinalist: false })
      },
      {
        sourceCandidateId: "c02",
        text: "Rada te imam, prijatelj moj, ker vedno čuvaš dom pod goro.",
        ...productionFinalist(2, { recommendedFinalist: false })
      },
      {
        sourceCandidateId: "c03",
        text: "Moj kosmati prijatelj bdi nad mano vse noči.",
        ...productionFinalist(3, { recommendedFinalist: false })
      }
    ]
  });
  const resolved = resolveProductionPageResult({
    result,
    rhymeRequired: true,
    sourceCandidates: [
      { id: "c01", text: "one" },
      { id: "c02", text: "two" },
      { id: "c03", text: "three" }
    ]
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.recommended.rank, 1);
    assert.ok(resolved.warnings.some((warning) => warning.code === "SOURCE_PROVENANCE_UNKNOWN"));
    assert.ok(resolved.warnings.some((warning) => warning.code === "RECOMMENDATION_METADATA_IMPERFECT"));
  }
});

test("a page result in which every finalist fails a gate is still rejected", () => {
  const result = productionPageEditorialResultSchema.parse({
    finalists: ["c01", "c02", "c03"].map((id, index) => ({
      sourceCandidateId: id,
      text: `Besedilo možnosti ${index + 1}, ki ga starš lahko prebere.`,
      ...productionFinalist(index + 1, { readAloudPass: false })
    }))
  });
  const resolved = resolveProductionPageResult({
    result,
    rhymeRequired: false,
    sourceCandidates: [
      { id: "c01", text: "one" },
      { id: "c02", text: "two" },
      { id: "c03", text: "three" }
    ]
  });
  assert.equal(resolved.ok, false);
  if (!resolved.ok) assert.equal(resolved.error.code, "NO_QUALIFYING_FINALIST");
});

test("full-book gates hard-fail only for the translation itself and respect the book form", () => {
  const spreads = [
    { spread: 2, fidelityPass: true, grammarPass: true, readAloudPass: true, directionPass: true, rhymePass: false },
    { spread: 3, fidelityPass: false, grammarPass: true, readAloudPass: true, directionPass: true, rhymePass: true }
  ];
  // Prose book: an honest rhymePass=false is not a failure; fidelityPass=false is.
  const proseFailures = failedFullBookGates(spreads, false);
  assert.deepEqual(proseFailures, [{ spread: 3, failed: ["fidelityPass"] }]);
  // Rhyming book: rhymePass=false is a real translation-level failure.
  const verseFailures = failedFullBookGates(spreads, true);
  assert.deepEqual(verseFailures, [
    { spread: 2, failed: ["rhymePass"] },
    { spread: 3, failed: ["fidelityPass"] }
  ]);
});
