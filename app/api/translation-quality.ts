import type { Priority } from "./translation-prompts";
import { requiresRhyme, type BookForm, type SourceRhyme } from "./book-form-contract.ts";

export type CandidateEvaluation = {
  candidateId: string;
  fidelityPass: boolean;
  grammarPass: boolean;
  readAloudPass: boolean;
  directionPass: boolean;
  rhymePass: boolean;
  pass: boolean;
  reasons: string[];
};

const slashForm = /\b[\p{L}]+\/[\p{L}]+\b/iu;
const forcedPhrase = /čisto\s+do\s+gobic/iu;
const inventedMushroomLove = /\b(?:ljubezen|ljubezni)\b[\s\S]{0,45}\b(?:raste|rastejo|poganja|gobe|gobice|gobah)\b/iu;
const metaLabel = /(?:^|\n)\s*(?:["“„]\s*)?(?:opomba|navodilo|razlaga|alternativa|možnost|predlog|refren|refrain|prevod|translation)\s*:/iu;
const instructionFragment = /\b(?:izberi(?:te)?|vstavi(?:te)?|zamenjaj(?:te)?|po želji|lahko uporabite|druga možnost)\b/iu;
const placeholder = /\{\{[^}]+\}\}|\[[^[\]]*(?:vstavi|izberi|besedilo|refren)[^[\]]*\]|<[^>]+>|_{2,}|…{2,}/iu;

export function deterministicViolations(text: string, options: { requireCompleteSentence?: boolean } = {}) {
  const violations: string[] = [];
  if (slashForm.test(text)) violations.push("slash-form gender placeholder");
  if (forcedPhrase.test(text)) violations.push("forced phrase: čisto do gobic");
  if (inventedMushroomLove.test(text)) violations.push("invented love-growing-like-mushrooms meaning");
  if (metaLabel.test(text)) violations.push("meta-commentary or quoted output label inside book text");
  if (instructionFragment.test(text)) violations.push("instruction fragment inside book text");
  if (placeholder.test(text)) violations.push("placeholder or unresolved alternative inside book text");
  if (
    !text.trim() ||
    (options.requireCompleteSentence !== false && !/[.!?…]|\n/u.test(text.trim()))
  ) violations.push("incomplete or fragmentary Slovenian");
  return violations;
}

export type DeclaredRhymePair = {
  firstLine: number;
  secondLine: number;
};

function finalWord(line: string) {
  return (line.toLocaleLowerCase("sl").match(/[\p{L}]+(?=[^\p{L}]*$)/u)?.[0] || "").normalize("NFC");
}

function longestSharedSuffix(first: string, second: string) {
  let length = 0;
  while (
    length < first.length &&
    length < second.length &&
    first[first.length - 1 - length] === second[second.length - 1 - length]
  ) length += 1;
  return length;
}

// Conservative structural check only: it rejects missing pairs, repeated end
// words, and obvious spelling-level non-rhymes. It cannot judge Slovenian stress.
export function declaredRhymeViolations(text: string, pairs: DeclaredRhymePair[]) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const violations: string[] = [];
  for (const pair of pairs) {
    const first = finalWord(lines[pair.firstLine - 1] || "");
    const second = finalWord(lines[pair.secondLine - 1] || "");
    if (!first || !second) {
      violations.push(`rhyme pair ${pair.firstLine}/${pair.secondLine} points to a missing line`);
    } else if (first === second) {
      violations.push(`rhyme pair ${pair.firstLine}/${pair.secondLine} repeats the same ending word`);
    } else if (longestSharedSuffix(first, second) < 2) {
      violations.push(`rhyme pair ${pair.firstLine}/${pair.secondLine} has no plausible shared ending`);
    }
  }
  return violations;
}

export function structuralDiversityViolations(structureIds: string[], selectedIds: string[]) {
  const selected = selectedIds.map((id) => structureIds[Number(id.slice(1)) - 1]).filter(Boolean);
  return new Set(selected).size === selectedIds.length
    ? []
    : ["selected finalists do not use three structurally distinct approaches"];
}

export function evaluationPasses(
  text: string,
  priority: Priority,
  evaluation: CandidateEvaluation,
  context?: { bookForm: BookForm; sourceRhyme: SourceRhyme }
) {
  if (deterministicViolations(text).length > 0) return false;
  if (!evaluation.fidelityPass || !evaluation.grammarPass || !evaluation.readAloudPass || !evaluation.directionPass) return false;
  const rhymeRequired = context
    ? requiresRhyme({ ...context, priority })
    : priority === "rhythm";
  if (rhymeRequired && !evaluation.rhymePass) return false;
  return evaluation.pass;
}
