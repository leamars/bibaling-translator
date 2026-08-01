import { z } from "zod";

export const RHYME_CLASSIFICATIONS = [
  "full_rhyme",
  "assonance",
  "consonance",
  "internal_rhyme",
  "no_meaningful_rhyme"
] as const;

const meaningfulText = z.string().trim().min(8).max(240);

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

function eligible(finalist: ComparativeFinalist, rhymeRequired: boolean) {
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
