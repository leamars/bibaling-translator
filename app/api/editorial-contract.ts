import { z } from "zod";

// ---------------------------------------------------------------------------
// This module contains two editorial contracts:
//
// 1. PRODUCTION CONTRACT (top of file) — the compact shape parent-facing
//    routes request and validate. Metadata problems in this contract are
//    warnings; only unusable reader-facing text hard-fails.
// 2. LIVE-EVALUATION AUDIT CONTRACT (bottom of file) — the deep comparative
//    shape retained for the live-evaluation harness under scripts/. It is not
//    used by production routes.
// ---------------------------------------------------------------------------

export const RHYME_CLASSIFICATIONS = [
  "full_rhyme",
  "assonance",
  "consonance",
  "internal_rhyme",
  "no_meaningful_rhyme"
] as const;

const meaningfulText = z.string().trim().min(8).max(240);

// ---------------------------------------------------------------------------
// PRODUCTION CONTRACT (compact)
// ---------------------------------------------------------------------------

// strength/weakness are genuinely warning-only metadata: the keys stay
// required so the editor is always asked for them, but there is no length
// minimum — an empty, short, or generic assessment parses fine and is
// reported through finalistMetadataWarnings() instead of failing the
// structured response.
export const productionFinalistFields = {
  rank: z.number().int().min(1).max(3),
  recommendedFinalist: z.boolean(),
  strength: z.string().trim().max(240),
  weakness: z.string().trim().max(240),
  // One short rhyme or read-aloud note when relevant; may be empty.
  qualityNote: z.string().trim().max(240)
} as const;

export const productionFinalistJsonProperties = {
  rank: { type: "integer", minimum: 1, maximum: 3 },
  recommendedFinalist: { type: "boolean" },
  strength: { type: "string", maxLength: 240 },
  weakness: { type: "string", maxLength: 240 },
  qualityNote: { type: "string", maxLength: 240 }
} as const;

export const productionFinalistJsonRequired = [
  "rank",
  "recommendedFinalist",
  "strength",
  "weakness",
  "qualityNote"
] as const;

export type ProductionFinalist = z.infer<z.ZodObject<typeof productionFinalistFields>> & {
  fidelityPass: boolean;
  grammarPass: boolean;
  readAloudPass: boolean;
  directionPass: boolean;
  rhymePass: boolean;
};

export type EditorialMetadataWarning = {
  code: string;
  message: string;
  finalistIndex?: number;
};

/**
 * Warning-only checks on the editor's bookkeeping. None of these invalidate a
 * usable translation; they surface diagnostics for logs and live evaluation.
 */
export function finalistMetadataWarnings(
  finalists: ProductionFinalist[],
  rhymeRequired: boolean
): EditorialMetadataWarning[] {
  const warnings: EditorialMetadataWarning[] = [];
  const ranks = finalists.map((finalist) => finalist.rank);
  if (new Set(ranks).size !== ranks.length || !ranks.every((rank) => rank >= 1 && rank <= finalists.length)) {
    warnings.push({ code: "RANK_METADATA_IMPERFECT", message: "finalist ranks are not unique ranks 1..n" });
  }
  const recommendedCount = finalists.filter((finalist) => finalist.recommendedFinalist).length;
  if (recommendedCount !== 1) {
    warnings.push({
      code: "RECOMMENDATION_METADATA_IMPERFECT",
      message: `${recommendedCount} finalists are flagged as recommended instead of exactly one`
    });
  }
  for (const [finalistIndex, finalist] of finalists.entries()) {
    const strengthIssue = materialAssessmentIssue(finalist.strength, "strength");
    if (strengthIssue) warnings.push({ code: "GENERIC_ASSESSMENT", message: strengthIssue, finalistIndex });
    const weaknessIssue = materialAssessmentIssue(finalist.weakness, "weakness");
    if (weaknessIssue) warnings.push({ code: "GENERIC_ASSESSMENT", message: weaknessIssue, finalistIndex });
    if (rhymeRequired && finalist.rhymePass && !finalist.qualityNote.trim()) {
      warnings.push({
        code: "RHYME_NOTE_MISSING",
        message: "a rhyme-passing finalist has no rhyme note for review",
        finalistIndex
      });
    }
  }
  return warnings;
}

export type NormalizedRecommendation<T> =
  | { ok: true; finalist: T; warnings: EditorialMetadataWarning[] }
  | {
    ok: false;
    error: { code: "NO_QUALIFYING_FINALIST"; message: string };
    warnings: EditorialMetadataWarning[];
  };

/**
 * Deterministically resolve the recommended finalist instead of failing the
 * request over recommendation bookkeeping:
 * - a unique explicitly recommended, eligible finalist wins;
 * - otherwise the lowest-ranked eligible finalist wins (array order breaks ties);
 * - only "no finalist passes its quality gates" remains a real failure,
 *   because that concerns the translations themselves.
 */
export function normalizeRecommendedFinalist<T extends ProductionFinalist>(args: {
  finalists: T[];
  rhymeRequired: boolean;
}): NormalizedRecommendation<T> {
  const warnings = finalistMetadataWarnings(args.finalists, args.rhymeRequired);
  const eligibleFinalists = args.finalists.filter((finalist) => eligible(finalist, args.rhymeRequired));
  if (eligibleFinalists.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_QUALIFYING_FINALIST",
        message: "No finalist met every minimum eligibility requirement."
      },
      warnings
    };
  }
  const explicitlyRecommended = eligibleFinalists.filter((finalist) => finalist.recommendedFinalist);
  const finalist = explicitlyRecommended.length === 1
    ? explicitlyRecommended[0]
    : [...eligibleFinalists].sort((first, second) => first.rank - second.rank)[0];
  if (explicitlyRecommended.length !== 1 || finalist.rank !== 1) {
    warnings.push({
      code: "RECOMMENDATION_NORMALIZED",
      message: "the recommendation was resolved deterministically from ranks and eligibility gates"
    });
  }
  return { ok: true, finalist, warnings };
}

// ---------------------------------------------------------------------------
// LIVE-EVALUATION AUDIT CONTRACT (deep) — retained for scripts/; not used by
// production routes.
// ---------------------------------------------------------------------------

export const comparativeCriteriaSchema = z.object({
  naturalness: meaningfulText,
  fidelity: meaningfulText,
  tone: meaningfulText,
  readAloudRhythm: meaningfulText,
  rhyme: meaningfulText,
  unsupportedInvention: meaningfulText
});

export const rhymeEvidenceSchema = z.object({
  anchorA: z.string().trim().min(1).max(80),
  anchorB: z.string().trim().min(1).max(80),
  lineA: z.string().trim().min(1).max(320),
  lineB: z.string().trim().min(1).max(320),
  soundFromFinalStressedVowelA: z.string().trim().min(1).max(80),
  soundFromFinalStressedVowelB: z.string().trim().min(1).max(80),
  classification: z.enum(RHYME_CLASSIFICATIONS),
  spokenAssessment: meaningfulText,
  grammaticalEndingOnly: z.boolean(),
  repeatedWord: z.boolean(),
  sameRootEcho: z.boolean(),
  countsAsRhyme: z.boolean()
});

export const rhymeAssessmentSchema = z.object({
  required: z.boolean(),
  evidence: z.array(rhymeEvidenceSchema).max(3),
  overallAssessment: meaningfulText
});

export const comparativeFinalistFields = {
  rank: z.number().int().min(1).max(3),
  recommendedFinalist: z.boolean(),
  strengths: z.array(meaningfulText).min(1).max(3),
  weaknesses: z.array(meaningfulText).min(1).max(3),
  comparativeAssessment: comparativeCriteriaSchema,
  rhymeAssessment: rhymeAssessmentSchema
} as const;

export const winnerComparisonSchema = z.object({
  alternativeRank: z.union([z.literal(2), z.literal(3)]),
  whyWinnerIsBetter: z.string().trim().min(20).max(360)
});

export const winnerComparisonsSchema = z.array(winnerComparisonSchema).length(2);

export type ComparativeFinalist = z.infer<z.ZodObject<typeof comparativeFinalistFields>> & {
  fidelityPass: boolean;
  grammarPass: boolean;
  readAloudPass: boolean;
  directionPass: boolean;
  rhymePass: boolean;
};

export type ComparativeContractIssue = {
  code: string;
  message: string;
  finalistIndex?: number;
};

export type ComparativeSelectionFailure = {
  ok: false;
  error: {
    code:
      | "COMPARATIVE_CONTRACT_INVALID"
      | "NO_QUALIFYING_FINALIST"
      | "RECOMMENDED_FINALIST_NOT_ELIGIBLE";
    message: string;
    issues: ComparativeContractIssue[];
  };
};

const genericAssessment = /^(?:none|n\/a|na|good|great|strong|solid|fine|acceptable|works|works well|no weakness(?:es)?|no issue(?:s)?|nothing material|fully natural|publication-ready)[.!]?$/iu;
const purelyComplimentaryWeakness = /^(?:excellent|natural|strong|clear|lovely|playful|effective|successful|well written|reads well|sounds good)(?:\s+(?:option|choice|text|refrain|translation))?[.!]?$/iu;
const complimentaryLanguage = /\b(?:excellent|natural|strong|clear|lovely|playful|effective|successful|good|great|smooth|faithful|works well)\b/iu;
const limitationLanguage = /\b(?:less|weaker|weakness|awkward|forced|unclear|loses?|adds?|shifts?|flatter|longer|stiff|literal|risk|lacks?|overstates?|understates?|not|could|may|needs?|concern|repetition|inversion|invention)\b/iu;

function materialAssessmentIssue(value: string, kind: "strength" | "weakness") {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (genericAssessment.test(normalized)) return `${kind} is generic rather than material`;
  if (kind === "weakness" && purelyComplimentaryWeakness.test(normalized)) {
    return "weakness is purely complimentary";
  }
  if (
    kind === "weakness" &&
    complimentaryLanguage.test(normalized) &&
    !limitationLanguage.test(normalized)
  ) {
    return "weakness is purely complimentary";
  }
  if (normalized.split(/\s+/u).length < 3) return `${kind} is too vague to support comparison`;
  return null;
}

type EligibilityGates = {
  fidelityPass: boolean;
  grammarPass: boolean;
  readAloudPass: boolean;
  directionPass: boolean;
  rhymePass: boolean;
};

function eligible(finalist: EligibilityGates, rhymeRequired: boolean) {
  return finalist.fidelityPass &&
    finalist.grammarPass &&
    finalist.readAloudPass &&
    finalist.directionPass &&
    (!rhymeRequired || finalist.rhymePass);
}

export function validateComparativeEditorialResult(args: {
  finalists: ComparativeFinalist[];
  winnerComparisons: z.infer<typeof winnerComparisonsSchema>;
  rhymeRequired: boolean;
}) {
  const issues: ComparativeContractIssue[] = [];
  const ranks = args.finalists.map((finalist) => finalist.rank);
  if (
    args.finalists.length !== 3 ||
    new Set(ranks).size !== 3 ||
    ![1, 2, 3].every((rank) => ranks.includes(rank))
  ) {
    issues.push({
      code: "RANK_INVARIANT",
      message: "finalists must have unique ranks 1, 2, and 3"
    });
  }
  const recommended = args.finalists.filter((finalist) => finalist.recommendedFinalist);
  if (recommended.length !== 1) {
    issues.push({
      code: "RECOMMENDATION_INVARIANT",
      message: "exactly one finalist must be recommended"
    });
  } else if (recommended[0].rank !== 1) {
    issues.push({
      code: "RECOMMENDATION_RANK_INVARIANT",
      message: "the recommended finalist must have rank 1"
    });
  }

  for (const [finalistIndex, finalist] of args.finalists.entries()) {
    for (const strength of finalist.strengths) {
      const message = materialAssessmentIssue(strength, "strength");
      if (message) issues.push({ code: "GENERIC_ASSESSMENT", message, finalistIndex });
    }
    for (const weakness of finalist.weaknesses) {
      const message = materialAssessmentIssue(weakness, "weakness");
      if (message) issues.push({ code: "GENERIC_ASSESSMENT", message, finalistIndex });
    }
    if (finalist.rhymeAssessment.required !== args.rhymeRequired) {
      issues.push({
        code: "RHYME_REQUIREMENT_MISMATCH",
        message: "rhyme assessment does not match the approved book-form requirement",
        finalistIndex
      });
    }
    if (args.rhymeRequired) {
      if (finalist.rhymeAssessment.evidence.length === 0) {
        issues.push({
          code: "RHYME_EVIDENCE_MISSING",
          message: "a rhyme-required finalist must identify the anchors it evaluated",
          finalistIndex
        });
      }
      const meaningful = finalist.rhymeAssessment.evidence.some((evidence) =>
        evidence.countsAsRhyme &&
        evidence.classification !== "no_meaningful_rhyme" &&
        !evidence.grammaticalEndingOnly &&
        !evidence.repeatedWord &&
        !evidence.sameRootEcho
      );
      if (finalist.rhymePass && !meaningful) {
        issues.push({
          code: "RHYME_EVIDENCE_MISSING",
          message: "a rhyme-passing finalist needs at least one meaningful spoken-rhyme analysis",
          finalistIndex
        });
      }
    }
  }

  const comparisonRanks = args.winnerComparisons.map((comparison) => comparison.alternativeRank);
  if (
    args.winnerComparisons.length !== 2 ||
    new Set(comparisonRanks).size !== 2 ||
    !([2, 3] as const).every((rank) => comparisonRanks.includes(rank))
  ) {
    issues.push({
      code: "WINNER_COMPARISON_INVARIANT",
      message: "the winner must be compared directly with both rank 2 and rank 3"
    });
  }
  for (const comparison of args.winnerComparisons) {
    if (genericAssessment.test(comparison.whyWinnerIsBetter.trim())) {
      issues.push({
        code: "GENERIC_WINNER_COMPARISON",
        message: `comparison with rank ${comparison.alternativeRank} is generic`
      });
    }
  }
  return issues;
}

export function selectRecommendedFinalist<T extends ComparativeFinalist>(args: {
  finalists: T[];
  winnerComparisons: z.infer<typeof winnerComparisonsSchema>;
  rhymeRequired: boolean;
}): { ok: true; finalist: T } | ComparativeSelectionFailure {
  const issues = validateComparativeEditorialResult(args);
  if (issues.length > 0) {
    return {
      ok: false,
      error: {
        code: "COMPARATIVE_CONTRACT_INVALID",
        message: "The editorial comparison violated a required invariant.",
        issues
      }
    };
  }
  const qualifying = args.finalists.filter((finalist) => eligible(finalist, args.rhymeRequired));
  if (qualifying.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_QUALIFYING_FINALIST",
        message: "No finalist met every minimum eligibility requirement.",
        issues: []
      }
    };
  }
  const recommended = args.finalists.find((finalist) => finalist.recommendedFinalist);
  if (!recommended || !eligible(recommended, args.rhymeRequired)) {
    return {
      ok: false,
      error: {
        code: "RECOMMENDED_FINALIST_NOT_ELIGIBLE",
        message: "The unique rank-1 recommendation did not meet every minimum requirement.",
        issues: []
      }
    };
  }
  return { ok: true, finalist: recommended };
}

export const comparativeJsonProperties = {
  rank: { type: "integer", minimum: 1, maximum: 3 },
  recommendedFinalist: { type: "boolean" },
  strengths: {
    type: "array",
    minItems: 1,
    maxItems: 3,
    items: { type: "string", minLength: 8, maxLength: 240 }
  },
  weaknesses: {
    type: "array",
    minItems: 1,
    maxItems: 3,
    items: { type: "string", minLength: 8, maxLength: 240 }
  },
  comparativeAssessment: {
    type: "object",
    additionalProperties: false,
    properties: {
      naturalness: { type: "string", minLength: 8, maxLength: 240 },
      fidelity: { type: "string", minLength: 8, maxLength: 240 },
      tone: { type: "string", minLength: 8, maxLength: 240 },
      readAloudRhythm: { type: "string", minLength: 8, maxLength: 240 },
      rhyme: { type: "string", minLength: 8, maxLength: 240 },
      unsupportedInvention: { type: "string", minLength: 8, maxLength: 240 }
    },
    required: [
      "naturalness",
      "fidelity",
      "tone",
      "readAloudRhythm",
      "rhyme",
      "unsupportedInvention"
    ]
  },
  rhymeAssessment: {
    type: "object",
    additionalProperties: false,
    properties: {
      required: { type: "boolean" },
      evidence: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            anchorA: { type: "string", minLength: 1, maxLength: 80 },
            anchorB: { type: "string", minLength: 1, maxLength: 80 },
            lineA: { type: "string", minLength: 1, maxLength: 320 },
            lineB: { type: "string", minLength: 1, maxLength: 320 },
            soundFromFinalStressedVowelA: { type: "string", minLength: 1, maxLength: 80 },
            soundFromFinalStressedVowelB: { type: "string", minLength: 1, maxLength: 80 },
            classification: { type: "string", enum: RHYME_CLASSIFICATIONS },
            spokenAssessment: { type: "string", minLength: 8, maxLength: 240 },
            grammaticalEndingOnly: { type: "boolean" },
            repeatedWord: { type: "boolean" },
            sameRootEcho: { type: "boolean" },
            countsAsRhyme: { type: "boolean" }
          },
          required: [
            "anchorA",
            "anchorB",
            "lineA",
            "lineB",
            "soundFromFinalStressedVowelA",
            "soundFromFinalStressedVowelB",
            "classification",
            "spokenAssessment",
            "grammaticalEndingOnly",
            "repeatedWord",
            "sameRootEcho",
            "countsAsRhyme"
          ]
        }
      },
      overallAssessment: { type: "string", minLength: 8, maxLength: 240 }
    },
    required: ["required", "evidence", "overallAssessment"]
  }
} as const;

export const comparativeJsonRequired = [
  "rank",
  "recommendedFinalist",
  "strengths",
  "weaknesses",
  "comparativeAssessment",
  "rhymeAssessment"
] as const;

export const winnerComparisonsJsonSchema = {
  type: "array",
  minItems: 2,
  maxItems: 2,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      alternativeRank: { type: "integer", enum: [2, 3] },
      whyWinnerIsBetter: { type: "string", minLength: 20, maxLength: 360 }
    },
    required: ["alternativeRank", "whyWinnerIsBetter"]
  }
} as const;
