import assert from "node:assert/strict";
import test from "node:test";
import {
  leanPageEditorialResultSchema,
  resolveLeanPageDecision,
  validateLeanPageEditorialResult,
  type LeanPageFinalist,
  type LeanPageEditorialResult
} from "../app/api/page-editorial-contract.ts";
import { translationEvaluationPrompt } from "../app/api/translation-prompts.ts";

const sources = [
  { id: "c01", text: "Original candidate one." },
  { id: "c02", text: "Original candidate two." },
  { id: "c03", text: "Original candidate three." }
];

function finalist(
  id: "c01" | "c02" | "c03",
  rank: 1 | 2 | 3,
  overrides: Partial<LeanPageFinalist> = {}
): LeanPageFinalist {
  const originalText = sources.find((source) => source.id === id)!.text;
  return {
    sourceCandidateId: id,
    originalText,
    evaluatedText: originalText,
    repaired: false,
    repairedAsDistinctResult: false,
    appliedEdits: [],
    rank,
    strengths: ["Preserves the source action in concise child-friendly language."],
    weaknesses: ["The opening cadence is less vivid than the strongest alternative."],
    optionalEdits: [],
    requiredEdits: [],
    eligibility: {
      fidelity: true,
      naturalness: true,
      tone: true,
      readAloud: true,
      direction: true,
      rhyme: true
    },
    rhymeEvidence: [{
      anchorA: "canción",
      anchorB: "corazón",
      classification: "full_rhyme" as const,
      countsAsRhyme: true,
      forcedOrGrammatical: false,
      note: "The complete spoken lines resolve naturally on the same stressed sound."
    }],
    ...overrides
  };
}

function result(
  overrides: Partial<LeanPageEditorialResult> = {}
): LeanPageEditorialResult {
  return leanPageEditorialResultSchema.parse({
    finalists: [
      finalist("c01", 1),
      finalist("c02", 2),
      finalist("c03", 3)
    ],
    decision: {
      outcome: "recommended",
      candidateIds: ["c01"],
      rationale: "Candidate c01 is the strongest natural and faithful read-aloud option.",
      comparisons: [
        {
          candidateId: "c02",
          justification: "Candidate c01 is more direct and rhythmically balanced than candidate c02."
        },
        {
          candidateId: "c03",
          justification: "Candidate c01 preserves the source more precisely than candidate c03."
        }
      ]
    },
    concernFindings: [],
    ...overrides
  });
}

test("repair provenance preserves original and evaluated text with exact applied edits", () => {
  const repaired = finalist("c01", 1, {
    evaluatedText: "Repaired candidate one.",
    repaired: true,
    appliedEdits: [{
      operation: "replace",
      before: "Original",
      after: "Repaired"
    }]
  });
  const value = result({
    finalists: [repaired, finalist("c02", 2), finalist("c03", 3)]
  });
  assert.deepEqual(validateLeanPageEditorialResult({
    result: value,
    rhymeRequired: true,
    sourceCandidates: sources
  }), []);
});

test("silent alteration and untracked repair provenance fail", () => {
  for (const changed of [
    finalist("c01", 1, { evaluatedText: "Silently changed." }),
    finalist("c01", 1, { evaluatedText: "Changed.", repaired: true })
  ]) {
    const issues = validateLeanPageEditorialResult({
      result: result({
        finalists: [changed, finalist("c02", 2), finalist("c03", 3)]
      }),
      rhymeRequired: true,
      sourceCandidates: sources
    });
    assert.ok(issues.some((issue) => issue.code === "REPAIR_PROVENANCE_INVALID"));
  }
});

test("required edits are substantive or fatal and unresolved edits make candidates ineligible", () => {
  assert.throws(() => leanPageEditorialResultSchema.parse({
    ...result(),
    finalists: [
      finalist("c01", 1, {
        requiredEdits: [{
          severity: "minor",
          operation: "edit",
          issue: "A tiny optional punctuation polish would improve the pause.",
          resolved: false
        }] as never
      }),
      finalist("c02", 2),
      finalist("c03", 3)
    ]
  }));

  const value = result({
    finalists: [
      finalist("c01", 1, {
        requiredEdits: [{
          severity: "substantive",
          operation: "remove",
          issue: "Remove the unsupported final sentence before this candidate can be used.",
          resolved: false
        }]
      }),
      finalist("c02", 2),
      finalist("c03", 3)
    ]
  });
  const issues = validateLeanPageEditorialResult({
    result: value,
    rhymeRequired: true,
    sourceCandidates: sources
  });
  assert.ok(issues.some((issue) =>
    issue.code === "UNREPAIRED_REQUIRED_EDIT_ELIGIBLE" ||
    issue.code === "RECOMMENDATION_INVALID"
  ));
});

test("fatal repairs require a distinct fully rewritten result", () => {
  const value = result({
    finalists: [
      finalist("c01", 1, {
        evaluatedText: "Rewritten candidate one.",
        repaired: true,
        repairedAsDistinctResult: false,
        appliedEdits: [{
          operation: "rewrite",
          before: "Original candidate one.",
          after: "Rewritten candidate one."
        }],
        requiredEdits: [{
          severity: "fatal",
          operation: "rewrite",
          issue: "The original invented the central event and required a complete rewrite.",
          resolved: true
        }]
      }),
      finalist("c02", 2),
      finalist("c03", 3)
    ]
  });
  const issues = validateLeanPageEditorialResult({
    result: value,
    rhymeRequired: true,
    sourceCandidates: sources
  });
  assert.ok(issues.some((issue) => issue.code === "FATAL_REPAIR_NOT_DISTINCT"));
});

test("resolved required edits require tracked repaired text", () => {
  const value = result();
  value.finalists[0].requiredEdits = [{
    severity: "substantive",
    operation: "reorder",
    issue: "Move the scene-specific line before the repeated refrain.",
    resolved: true
  }];
  const issues = validateLeanPageEditorialResult({
    result: value,
    rhymeRequired: false,
    sourceCandidates: sources
  });
  assert.ok(issues.some((issue) => issue.code === "RESOLVED_EDIT_WITHOUT_REPAIR"));
});

test("each finalist traces to a distinct submitted candidate", () => {
  const value = result();
  value.finalists[1].sourceCandidateId = value.finalists[0].sourceCandidateId;
  value.finalists[1].originalText = value.finalists[0].originalText;
  const issues = validateLeanPageEditorialResult({
    result: value,
    rhymeRequired: false,
    sourceCandidates: sources
  });
  assert.ok(issues.some((issue) => issue.code === "SOURCE_CANDIDATE_DUPLICATED"));
});

test("decision supports one recommendation, equivalent groups, and whole-set rejection", () => {
  const recommended = resolveLeanPageDecision({
    result: result(),
    rhymeRequired: true,
    sourceCandidates: sources
  });
  assert.equal(recommended.ok && recommended.outcome, "recommended");

  const equivalent = resolveLeanPageDecision({
    result: result({
      decision: {
        outcome: "equivalent_group",
        candidateIds: ["c01", "c02"],
        rationale: "Candidates c01 and c02 are equally natural, faithful, and effective aloud.",
        comparisons: [{
          candidateId: "c03",
          justification: "Both selected candidates preserve the source more precisely than candidate c03."
        }]
      }
    }),
    rhymeRequired: true,
    sourceCandidates: sources
  });
  assert.equal(equivalent.ok && equivalent.outcome, "equivalent_group");

  const rejectedFinalists = [
    finalist("c01", 1, { eligibility: { fidelity: false, naturalness: true, tone: true, readAloud: true, direction: true, rhyme: true } }),
    finalist("c02", 2, { eligibility: { fidelity: false, naturalness: true, tone: true, readAloud: true, direction: true, rhyme: true } }),
    finalist("c03", 3, { eligibility: { fidelity: false, naturalness: true, tone: true, readAloud: true, direction: true, rhyme: true } })
  ];
  const rejected = resolveLeanPageDecision({
    result: result({
      finalists: rejectedFinalists,
      decision: {
        outcome: "no_qualifying_finalist",
        candidateIds: [],
        rationale: "Every finalist loses a required source event and therefore fails minimum fidelity.",
        comparisons: []
      }
    }),
    rhymeRequired: true,
    sourceCandidates: sources
  });
  assert.equal(rejected.ok && rejected.outcome, "no_qualifying_finalist");
});

test("evaluation concern findings cover every supplied concern exactly once", () => {
  const value = result({
    concernFindings: [{
      concernId: "line-order",
      disposition: "recognized",
      note: "The page-specific line belongs before the locked repeated refrain."
    }]
  });
  assert.deepEqual(validateLeanPageEditorialResult({
    result: value,
    rhymeRequired: true,
    sourceCandidates: sources,
    expectedConcernIds: ["line-order"]
  }), []);
});

test("page prompt requests the lean contract and required-edit policy", () => {
  const prompt = translationEvaluationPrompt({
    spreadNumber: 1,
    source: "The forest dances.",
    priority: "rhythm",
    freedom: "natural",
    bookForm: "refrain_verse",
    sourceRhyme: "sustained",
    direction: {
      name: "Refrain",
      refrain: "A fixed refrain.",
      approach: "Repeat it.",
      genderDependency: "None"
    },
    candidatesJson: JSON.stringify(sources),
    targetLanguage: "es",
    regionalVariant: "es-ES",
    evaluationConcerns: [{
      id: "line-order",
      text: "Move the forest line before the refrain."
    }]
  });
  assert.match(prompt, /PAGE EDITORIAL CONTRACT/);
  assert.match(prompt, /unique ranks 1, 2, and 3/);
  assert.match(prompt, /An unresolved substantive issue must make the relevant pass field false/);
  assert.match(prompt, /do not disguise that failure/);
  assert.match(prompt, /one concise material strength/);
  assert.match(prompt, /line-order/);
  // The compact production contract no longer requests audit paperwork.
  assert.doesNotMatch(prompt, /appliedEdits|requiredEdits|concernFindings|winnerComparisons|equivalent_group/);
});
