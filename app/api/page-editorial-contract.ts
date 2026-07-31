import { z } from "zod";
import { RHYME_CLASSIFICATIONS } from "./editorial-contract.ts";

const conciseText = z.string().trim().min(8).max(180);
const operationSchema = z.enum([
  "edit",
  "remove",
  "reorder",
  "restore",
  "replace",
  "rewrite"
]);

export const pageEligibilitySchema = z.object({
  fidelity: z.boolean(),
  naturalness: z.boolean(),
  tone: z.boolean(),
  readAloud: z.boolean(),
  direction: z.boolean(),
  rhyme: z.boolean()
});

export const requiredEditSchema = z.object({
  severity: z.enum(["substantive", "fatal"]),
  operation: operationSchema,
  issue: conciseText,
  resolved: z.boolean()
});

export const appliedEditSchema = z.object({
  operation: operationSchema,
  before: z.string().max(240),
  after: z.string().max(240)
});

export const leanRhymeEvidenceSchema = z.object({
  anchorA: z.string().trim().min(1).max(60),
  anchorB: z.string().trim().min(1).max(60),
  classification: z.enum(RHYME_CLASSIFICATIONS),
  countsAsRhyme: z.boolean(),
  forcedOrGrammatical: z.boolean(),
  note: conciseText
});

export const leanPageFinalistSchema = z.object({
  sourceCandidateId: z.string().trim().min(1).max(40),
  originalText: z.string().trim().min(1).max(2_000),
  evaluatedText: z.string().trim().min(1).max(2_000),
  repaired: z.boolean(),
  repairedAsDistinctResult: z.boolean(),
  appliedEdits: z.array(appliedEditSchema).max(4),
  rank: z.number().int().min(1).max(3),
  strengths: z.array(conciseText).min(1).max(2),
  weaknesses: z.array(conciseText).min(1).max(2),
  optionalEdits: z.array(conciseText).max(2),
  requiredEdits: z.array(requiredEditSchema).max(3),
  eligibility: pageEligibilitySchema,
  rhymeEvidence: z.array(leanRhymeEvidenceSchema).max(2)
});

export const pageDecisionSchema = z.object({
  outcome: z.enum([
    "recommended",
    "equivalent_group",
    "no_qualifying_finalist"
  ]),
  candidateIds: z.array(z.string().trim().min(1).max(40)).max(3),
  rationale: z.string().trim().min(20).max(300),
  comparisons: z.array(z.object({
    candidateId: z.string().trim().min(1).max(40),
    justification: z.string().trim().min(20).max(240)
  })).max(2)
});

export const concernFindingSchema = z.object({
  concernId: z.string().trim().min(1).max(80),
  disposition: z.enum(["recognized", "addressed", "unresolved", "disagreed"]),
  note: z.string().trim().min(8).max(220)
});

export const leanPageEditorialResultSchema = z.object({
  finalists: z.array(leanPageFinalistSchema).length(3),
  decision: pageDecisionSchema,
  concernFindings: z.array(concernFindingSchema).max(8)
});

export type LeanPageFinalist = z.infer<typeof leanPageFinalistSchema>;
export type LeanPageEditorialResult = z.infer<typeof leanPageEditorialResultSchema>;

export type PageEditorialContractIssue = {
  code: string;
  message: string;
  finalistIndex?: number;
};

function qualifying(finalist: LeanPageFinalist) {
  return Object.values(finalist.eligibility).every(Boolean) &&
    finalist.requiredEdits.every((edit) => edit.resolved);
}

export function validateLeanPageEditorialResult(args: {
  result: LeanPageEditorialResult;
  rhymeRequired: boolean;
  sourceCandidates: Array<{ id: string; text: string }>;
  expectedConcernIds?: string[];
}) {
  const issues: PageEditorialContractIssue[] = [];
  const ranks = args.result.finalists.map((finalist) => finalist.rank);
  if (new Set(ranks).size !== 3 || ![1, 2, 3].every((rank) => ranks.includes(rank))) {
    issues.push({ code: "RANK_INVARIANT", message: "Finalists require unique ranks 1, 2, and 3." });
  }
  const sourceCandidateIds = args.result.finalists.map(
    (finalist) => finalist.sourceCandidateId
  );
  if (new Set(sourceCandidateIds).size !== sourceCandidateIds.length) {
    issues.push({
      code: "SOURCE_CANDIDATE_DUPLICATED",
      message: "Each finalist must trace to a different submitted source candidate."
    });
  }
  const sources = new Map(args.sourceCandidates.map((candidate) => [candidate.id, candidate.text]));
  for (const [finalistIndex, finalist] of args.result.finalists.entries()) {
    const sourceText = sources.get(finalist.sourceCandidateId);
    if (!sourceText || sourceText !== finalist.originalText) {
      issues.push({
        code: "SOURCE_PROVENANCE_INVALID",
        message: "sourceCandidateId and originalText must identify an unchanged submitted draft.",
        finalistIndex
      });
    }
    const textChanged = finalist.originalText !== finalist.evaluatedText;
    if (
      finalist.repaired !== textChanged ||
      (finalist.repaired && finalist.appliedEdits.length === 0) ||
      (!finalist.repaired && finalist.appliedEdits.length > 0)
    ) {
      issues.push({
        code: "REPAIR_PROVENANCE_INVALID",
        message: "Repairs require changed evaluatedText and exact applied edits; unchanged text cannot claim repairs.",
        finalistIndex
      });
    }
    if (finalist.repairedAsDistinctResult && !finalist.repaired) {
      issues.push({
        code: "DISTINCT_REPAIR_INVALID",
        message: "A distinct repaired result must actually change the submitted text.",
        finalistIndex
      });
    }
    for (const edit of finalist.requiredEdits) {
      if (edit.resolved && !finalist.repaired) {
        issues.push({
          code: "RESOLVED_EDIT_WITHOUT_REPAIR",
          message: "A resolved substantive or fatal edit requires tracked repaired text.",
          finalistIndex
        });
      }
      if (!edit.resolved && Object.values(finalist.eligibility).every(Boolean)) {
        issues.push({
          code: "UNREPAIRED_REQUIRED_EDIT_ELIGIBLE",
          message: "An unrepaired substantive or fatal edit must make a relevant eligibility gate false.",
          finalistIndex
        });
      }
      if (
        edit.severity === "fatal" &&
        edit.resolved &&
        (!finalist.repairedAsDistinctResult || !finalist.repaired)
      ) {
        issues.push({
          code: "FATAL_REPAIR_NOT_DISTINCT",
          message: "A resolved fatal issue requires a fully rewritten, distinct repaired result.",
          finalistIndex
        });
      }
    }
    if (
      args.rhymeRequired &&
      finalist.eligibility.rhyme &&
      !finalist.rhymeEvidence.some((evidence) =>
        evidence.countsAsRhyme &&
        evidence.classification !== "no_meaningful_rhyme" &&
        !evidence.forcedOrGrammatical
      )
    ) {
      issues.push({
        code: "RHYME_EVIDENCE_MISSING",
        message: "A rhyme-eligible finalist needs concise evidence of an unforced spoken rhyme.",
        finalistIndex
      });
    }
  }

  const byId = new Map(
    args.result.finalists.map((finalist) => [finalist.sourceCandidateId, finalist])
  );
  const selectedIds = args.result.decision.candidateIds;
  const selected = selectedIds.map((id) => byId.get(id));
  const uniqueIds = new Set(selectedIds);
  const unselectedIds = args.result.finalists
    .map((finalist) => finalist.sourceCandidateId)
    .filter((id) => !uniqueIds.has(id));
  const comparisonIds = args.result.decision.comparisons.map((item) => item.candidateId);

  if (uniqueIds.size !== selectedIds.length || selected.some((item) => !item)) {
    issues.push({ code: "DECISION_ID_INVALID", message: "Decision candidate IDs must uniquely identify returned finalists." });
  }
  if (args.result.decision.outcome === "recommended") {
    if (
      selected.length !== 1 ||
      selected[0]?.rank !== 1 ||
      !selected[0] ||
      !qualifying(selected[0])
    ) {
      issues.push({ code: "RECOMMENDATION_INVALID", message: "A recommendation requires the unique qualifying rank-1 finalist." });
    }
  } else if (args.result.decision.outcome === "equivalent_group") {
    if (
      selected.length < 2 ||
      !selected.some((item) => item?.rank === 1) ||
      selected.some((item) => !item || !qualifying(item))
    ) {
      issues.push({ code: "EQUIVALENT_GROUP_INVALID", message: "An equivalent group requires rank 1 and at least one other qualifying finalist." });
    }
  } else if (
    selected.length !== 0 ||
    args.result.finalists.some(qualifying)
  ) {
    issues.push({ code: "NO_QUALIFYING_INVALID", message: "Whole-set rejection requires no candidate IDs and no qualifying finalist." });
  }

  if (
    args.result.decision.outcome !== "no_qualifying_finalist" &&
    (
      new Set(comparisonIds).size !== comparisonIds.length ||
      comparisonIds.length !== unselectedIds.length ||
      !unselectedIds.every((id) => comparisonIds.includes(id))
    )
  ) {
    issues.push({
      code: "COMPARISON_COVERAGE_INVALID",
      message: "Decision comparisons must cover every finalist outside the selected recommendation or equivalent group."
    });
  }

  const expectedConcerns = new Set(args.expectedConcernIds || []);
  const returnedConcerns = args.result.concernFindings.map((finding) => finding.concernId);
  if (
    expectedConcerns.size !== returnedConcerns.length ||
    returnedConcerns.some((id) => !expectedConcerns.has(id))
  ) {
    issues.push({
      code: "CONCERN_COVERAGE_INVALID",
      message: "Evaluation concern findings must cover every supplied concern exactly once."
    });
  }
  return issues;
}

export function resolveLeanPageDecision(args: {
  result: LeanPageEditorialResult;
  rhymeRequired: boolean;
  sourceCandidates: Array<{ id: string; text: string }>;
  expectedConcernIds?: string[];
}) {
  const issues = validateLeanPageEditorialResult(args);
  if (issues.length) {
    return {
      ok: false as const,
      error: {
        code: "LEAN_EDITORIAL_CONTRACT_INVALID" as const,
        message: "The lean page editorial response violated a required invariant.",
        issues
      }
    };
  }
  const selected = new Set(args.result.decision.candidateIds);
  return {
    ok: true as const,
    outcome: args.result.decision.outcome,
    finalists: args.result.finalists.filter((finalist) =>
      args.result.decision.outcome === "no_qualifying_finalist"
        ? false
        : selected.has(finalist.sourceCandidateId)
    )
  };
}

const conciseStringJson = { type: "string", minLength: 8, maxLength: 180 } as const;

export const leanPageEditorialJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    finalists: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceCandidateId: { type: "string", minLength: 1, maxLength: 40 },
          originalText: { type: "string", minLength: 1, maxLength: 2_000 },
          evaluatedText: { type: "string", minLength: 1, maxLength: 2_000 },
          repaired: { type: "boolean" },
          repairedAsDistinctResult: { type: "boolean" },
          appliedEdits: {
            type: "array",
            minItems: 0,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                operation: { type: "string", enum: operationSchema.options },
                before: { type: "string", maxLength: 240 },
                after: { type: "string", maxLength: 240 }
              },
              required: ["operation", "before", "after"]
            }
          },
          rank: { type: "integer", minimum: 1, maximum: 3 },
          strengths: { type: "array", minItems: 1, maxItems: 2, items: conciseStringJson },
          weaknesses: { type: "array", minItems: 1, maxItems: 2, items: conciseStringJson },
          optionalEdits: { type: "array", minItems: 0, maxItems: 2, items: conciseStringJson },
          requiredEdits: {
            type: "array",
            minItems: 0,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                severity: { type: "string", enum: ["substantive", "fatal"] },
                operation: { type: "string", enum: operationSchema.options },
                issue: conciseStringJson,
                resolved: { type: "boolean" }
              },
              required: ["severity", "operation", "issue", "resolved"]
            }
          },
          eligibility: {
            type: "object",
            additionalProperties: false,
            properties: {
              fidelity: { type: "boolean" },
              naturalness: { type: "boolean" },
              tone: { type: "boolean" },
              readAloud: { type: "boolean" },
              direction: { type: "boolean" },
              rhyme: { type: "boolean" }
            },
            required: ["fidelity", "naturalness", "tone", "readAloud", "direction", "rhyme"]
          },
          rhymeEvidence: {
            type: "array",
            minItems: 0,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                anchorA: { type: "string", minLength: 1, maxLength: 60 },
                anchorB: { type: "string", minLength: 1, maxLength: 60 },
                classification: { type: "string", enum: RHYME_CLASSIFICATIONS },
                countsAsRhyme: { type: "boolean" },
                forcedOrGrammatical: { type: "boolean" },
                note: conciseStringJson
              },
              required: [
                "anchorA",
                "anchorB",
                "classification",
                "countsAsRhyme",
                "forcedOrGrammatical",
                "note"
              ]
            }
          }
        },
        required: [
          "sourceCandidateId",
          "originalText",
          "evaluatedText",
          "repaired",
          "repairedAsDistinctResult",
          "appliedEdits",
          "rank",
          "strengths",
          "weaknesses",
          "optionalEdits",
          "requiredEdits",
          "eligibility",
          "rhymeEvidence"
        ]
      }
    },
    decision: {
      type: "object",
      additionalProperties: false,
      properties: {
        outcome: {
          type: "string",
          enum: ["recommended", "equivalent_group", "no_qualifying_finalist"]
        },
        candidateIds: {
          type: "array",
          minItems: 0,
          maxItems: 3,
          items: { type: "string", minLength: 1, maxLength: 40 }
        },
        rationale: { type: "string", minLength: 20, maxLength: 300 },
        comparisons: {
          type: "array",
          minItems: 0,
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              candidateId: { type: "string", minLength: 1, maxLength: 40 },
              justification: { type: "string", minLength: 20, maxLength: 240 }
            },
            required: ["candidateId", "justification"]
          }
        }
      },
      required: ["outcome", "candidateIds", "rationale", "comparisons"]
    },
    concernFindings: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          concernId: { type: "string", minLength: 1, maxLength: 80 },
          disposition: {
            type: "string",
            enum: ["recognized", "addressed", "unresolved", "disagreed"]
          },
          note: { type: "string", minLength: 8, maxLength: 220 }
        },
        required: ["concernId", "disposition", "note"]
      }
    }
  },
  required: ["finalists", "decision", "concernFindings"]
} as const;
