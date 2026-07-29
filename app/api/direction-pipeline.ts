import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Response } from "openai/resources/responses/responses";
import { deterministicViolations } from "./translation-quality.ts";

export const DIRECTION_PROMPT_VERSION = "step5-v8-assigned-observable-constructions";
export const DIRECTION_VALIDATION_VERSION = "step5-validation-v7-observable-form-and-rhyme-pairs";
export const DIRECTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const DIRECTION_PIPELINE_CONFIG = {
  drafting: {
    model: "gpt-5.6-sol",
    reasoningEffort: "low",
    timeoutMs: 150_000,
    maxOutputTokens: 5_000,
    candidateCount: 5,
    minimumUsableCandidates: 2
  },
  editorial: {
    model: "gpt-5.6-sol",
    reasoningEffort: "low",
    timeoutMs: 90_000,
    maxOutputTokens: 3_500,
    optionCount: 3
  }
} as const;

export type DirectionErrorCode =
  | "DRAFT_TIMEOUT"
  | "DRAFT_OUTPUT_LIMIT"
  | "DRAFT_INVALID_OUTPUT"
  | "DRAFT_QUALITY_REJECTION"
  | "EDITOR_TIMEOUT"
  | "EDITOR_OUTPUT_LIMIT"
  | "EDITOR_INVALID_OUTPUT"
  | "NETWORK_FAILURE";

export class DirectionPipelineError extends Error {
  readonly code: DirectionErrorCode;
  readonly cause?: unknown;

  constructor(
    code: DirectionErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "DirectionPipelineError";
    this.code = code;
    this.cause = cause;
  }
}

export const privateCandidateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  refrain: z.string().trim().min(1).max(320),
  approach: z.string().trim().min(1).max(120)
});
export type PrivateDirectionCandidate = z.infer<typeof privateCandidateSchema>;

export const privateCandidatesSchema = z.object({
  candidates: z.array(privateCandidateSchema).length(DIRECTION_PIPELINE_CONFIG.drafting.candidateCount)
});

export const editorialOptionSchema = z.object({
  sourceCandidateIndex: z.number().int().min(-1).max(DIRECTION_PIPELINE_CONFIG.drafting.candidateCount - 1),
  label: z.string().trim().min(1).max(40),
  refrain: z.string().trim().min(1).max(320),
  description: z.string().trim().min(1).max(120),
  genderDependency: z.string().trim().min(1).max(120),
  construction: z.enum(["couplet", "playful_hook", "lyrical_refrain"]),
  rhymePairs: z.array(z.object({
    endingA: z.string().trim().min(1).max(30),
    endingB: z.string().trim().min(1).max(30)
  })).min(1).max(2)
});
export const editorialOptionsSchema = z.object({
  options: z.array(editorialOptionSchema).length(DIRECTION_PIPELINE_CONFIG.editorial.optionCount)
});

type Stage = "draft" | "editor";
type ResponseLike = Pick<Response, "id" | "status" | "output" | "output_text" | "incomplete_details" | "usage">;

function hasRefusal(response: ResponseLike) {
  return response.output.some((item) =>
    item.type === "message" &&
    item.content.some((content) => content.type === "refusal")
  );
}

export function completedOutput(response: ResponseLike, stage: Stage) {
  const prefix = stage === "draft" ? "DRAFT" : "EDITOR";
  const incompleteReason = response.incomplete_details?.reason;
  if (response.status === "incomplete") {
    throw new DirectionPipelineError(
      incompleteReason === "max_output_tokens" ? `${prefix}_OUTPUT_LIMIT` : `${prefix}_INVALID_OUTPUT`,
      `The ${stage} response was incomplete${incompleteReason ? `: ${incompleteReason}` : ""}.`
    );
  }
  if (response.status !== "completed" || hasRefusal(response) || !response.output_text?.trim()) {
    throw new DirectionPipelineError(
      `${prefix}_INVALID_OUTPUT`,
      `The ${stage} response did not contain completed structured output.`
    );
  }
  return response.output_text;
}

export function parseCompletedOutput<T>(
  response: ResponseLike,
  stage: Stage,
  schema: z.ZodType<T>
) {
  const output = completedOutput(response, stage);
  try {
    return schema.parse(JSON.parse(output));
  } catch (error) {
    if (error instanceof DirectionPipelineError) throw error;
    throw new DirectionPipelineError(
      stage === "draft" ? "DRAFT_INVALID_OUTPUT" : "EDITOR_INVALID_OUTPUT",
      `The completed ${stage} response failed structured-output validation.`,
      error
    );
  }
}

export function normalizeRefrain(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("sl")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string) {
  return value.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) ?? [];
}

function sentences(value: string) {
  return value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

export type RefrainBudget = {
  sourceRefrain: string;
  sourceWordCount: number;
  sourceCharacterCount: number;
  maximumWordCount: number;
  maximumCharacterCount: number;
  maximumSentenceCount: number;
  maximumClauseCount: number;
};

export function deriveRefrainBudget(texts: string[]): RefrainBudget {
  const sourceSentences = sentences(texts[0] || "");
  const otherSentenceTokens = texts.slice(1).map((text) => sentences(text).map((sentence) =>
    new Set(words(sentence).map((word) => word.toLocaleLowerCase("en")))
  ));
  const sourceRefrain = sourceSentences
    .map((sentence) => {
      const tokens = new Set(words(sentence).map((word) => word.toLocaleLowerCase("en")));
      const score = otherSentenceTokens.reduce((total, group) => {
        const best = group.reduce((maximum, candidate) => {
          const overlap = [...tokens].filter((token) => candidate.has(token)).length;
          return Math.max(maximum, overlap / Math.max(1, new Set([...tokens, ...candidate]).size));
        }, 0);
        return total + best;
      }, 0);
      return { sentence, score };
    })
    .sort((first, second) => second.score - first.score)[0]?.sentence || texts[0]?.trim() || "";
  const sourceWordCount = words(sourceRefrain).length;
  const sourceCharacterCount = sourceRefrain.length;
  const relativeWordLimit = Math.ceil(sourceWordCount * 1.25);
  return {
    sourceRefrain,
    sourceWordCount,
    sourceCharacterCount,
    maximumWordCount: sourceWordCount > 12 ? relativeWordLimit : Math.min(12, relativeWordLimit),
    maximumCharacterCount: Math.ceil(sourceCharacterCount * 1.3),
    maximumSentenceCount: sourceRefrain.includes("?") ? 2 : 1,
    maximumClauseCount: 2
  };
}

export function refrainBudgetViolations(refrain: string, budget: RefrainBudget) {
  const violations: string[] = [];
  const wordList = words(refrain);
  const semanticLines = refrain.split(/\r?\n/).filter((line) => line.trim());
  const sentenceCount = sentences(refrain).length;
  const clauseCount = 1 + (refrain.match(/[,;:]|\s[—–]\s/g)?.length ?? 0);
  if (wordList.length > budget.maximumWordCount) violations.push(`exceeds ${budget.maximumWordCount}-word source-relative limit`);
  if (refrain.length > budget.maximumCharacterCount) violations.push(`exceeds ${budget.maximumCharacterCount}-character source-relative limit`);
  if (semanticLines.length > 2) violations.push("expands into more than two semantic lines");
  if (sentenceCount > budget.maximumSentenceCount) violations.push(`contains ${sentenceCount} sentences`);
  if (clauseCount > budget.maximumClauseCount) violations.push(`contains ${clauseCount} clauses`);
  const normalizedWords = wordList.map((word) => word.toLocaleLowerCase("sl"));
  if (normalizedWords.some((word, index) => index > 0 && word === normalizedWords[index - 1])) {
    violations.push("repeats a word consecutively as padding");
  }
  return violations;
}

function nearDuplicate(first: string, second: string) {
  if (first === second) return true;
  const a = new Set(first.split(" ").filter(Boolean));
  const b = new Set(second.split(" ").filter(Boolean));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 && intersection / union >= 0.72;
}

function finalWord(value: string) {
  return (value.toLocaleLowerCase("sl").match(/[\p{L}]+(?=[^\p{L}]*$)/u)?.[0] || "").normalize("NFC");
}

function sharedSuffixLength(first: string, second: string) {
  let length = 0;
  while (
    length < first.length &&
    length < second.length &&
    first[first.length - 1 - length] === second[second.length - 1 - length]
  ) length += 1;
  return length;
}

function rhymeUnits(refrain: string) {
  const lines = refrain.split(/\r?\n/u).map((part) => part.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return refrain.split(/[,;:]|\s[—–]\s/u).map((part) => part.trim()).filter(Boolean);
}

function contentWords(value: string) {
  const stop = new Set(["in", "se", "je", "so", "sem", "smo", "vas", "vam", "vse", "z", "za", "na", "ko", "ker", "kako"]);
  return words(value).map((word) => word.toLocaleLowerCase("sl")).filter((word) => word.length > 2 && !stop.has(word));
}

export function rhymePairViolations(
  refrain: string,
  pairs: Array<{ endingA: string; endingB: string }>
) {
  const violations: string[] = [];
  const unitEndings = rhymeUnits(refrain).map(finalWord);
  for (const [index, pair] of pairs.entries()) {
    const first = finalWord(pair.endingA);
    const second = finalWord(pair.endingB);
    if (!first || !second) violations.push(`rhyme pair ${index + 1} is incomplete`);
    else if (first === second) violations.push(`rhyme pair ${index + 1} repeats the same word`);
    else if (sharedSuffixLength(first, second) < 2) violations.push(`rhyme pair ${index + 1} has no plausible shared spoken ending`);
    if (first && !unitEndings.includes(first)) violations.push(`rhyme pair ${index + 1}'s first ending is not a line or phrase ending`);
    if (second && !unitEndings.includes(second)) violations.push(`rhyme pair ${index + 1}'s second ending is not a line or phrase ending`);
  }
  return violations;
}

function constructionViolations(option: z.infer<typeof editorialOptionSchema>) {
  const violations: string[] = [];
  const lines = option.refrain.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const units = rhymeUnits(option.refrain);
  const normalizedWords = words(option.refrain).map((word) => word.toLocaleLowerCase("sl"));
  const repeatedContent = contentWords(option.refrain).some((word, index, all) => all.indexOf(word) !== index);

  if (option.construction === "couplet" && lines.length !== 2) {
    violations.push("couplet is not written as exactly two short lines");
  }
  if (option.construction === "playful_hook" && !repeatedContent) {
    violations.push("playful_hook has no observable repetition or echo");
  }
  if (option.construction === "lyrical_refrain") {
    if (lines.length !== 1 || units.length !== 2) {
      violations.push("lyrical_refrain is not one flowing line with two balanced phrases");
    }
    if (repeatedContent) violations.push("lyrical_refrain repeats the hook instead of flowing");
  }
  if (normalizedWords.length === 0) violations.push("construction has no words");
  return violations;
}

function opening(value: string) {
  return words(value).slice(0, 2).map((word) => word.toLocaleLowerCase("sl")).join(" ");
}

function phraseOverlap(first: string, second: string) {
  const a = new Set(contentWords(first));
  const b = new Set(contentWords(second));
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / Math.max(1, Math.min(a.size, b.size));
}

function clauseOrderSignature(value: string) {
  return rhymeUnits(value)
    .map((unit) => contentWords(unit)[0] || words(unit)[0]?.toLocaleLowerCase("sl") || "")
    .join(">");
}

export function finalDirectionSetViolations(
  options: z.infer<typeof editorialOptionsSchema>["options"],
  requireRhyme: boolean,
  availableSeedCount: number = DIRECTION_PIPELINE_CONFIG.drafting.candidateCount
) {
  const violations: string[] = [];
  const requiredConstructions = new Set(["couplet", "playful_hook", "lyrical_refrain"]);
  if (
    new Set(options.map((option) => option.construction)).size !== 3 ||
    options.some((option) => !requiredConstructions.has(option.construction))
  ) {
    violations.push("final options are not exactly one couplet, one playful_hook, and one lyrical_refrain");
  }
  const seedIndexes = options.map((option) => option.sourceCandidateIndex).filter((index) => index >= 0);
  if (new Set(seedIndexes).size !== seedIndexes.length) {
    violations.push("multiple finalists derive from the same surviving seed");
  }
  if (availableSeedCount === 2 && options.filter((option) => option.sourceCandidateIndex === -1).length !== 1) {
    violations.push("a two-seed editorial pass must independently generate exactly one missing construction");
  }
  for (const [index, option] of options.entries()) {
    const normalized = normalizeRefrain(option.refrain);
    if (options.slice(0, index).some((other) => nearDuplicate(normalized, normalizeRefrain(other.refrain)))) {
      violations.push(`option ${index + 1} closely paraphrases another final option`);
    }
    violations.push(...constructionViolations(option).map((reason) => `option ${index + 1}: ${reason}`));
    if (requireRhyme) {
      violations.push(...rhymePairViolations(option.refrain, option.rhymePairs)
        .map((reason) => `option ${index + 1}: ${reason}`));
    }
    for (const [otherIndex, other] of options.slice(0, index).entries()) {
      if (opening(option.refrain) === opening(other.refrain)) {
        violations.push(`options ${otherIndex + 1} and ${index + 1} have the same opening`);
      }
      if (phraseOverlap(option.refrain, other.refrain) >= 0.7) {
        violations.push(`options ${otherIndex + 1} and ${index + 1} have excessive phrase overlap`);
      }
      if (clauseOrderSignature(option.refrain) === clauseOrderSignature(other.refrain)) {
        violations.push(`options ${otherIndex + 1} and ${index + 1} reuse the same clause-order pattern`);
      }
      const pairKey = (candidate: typeof option) => candidate.rhymePairs
        .map((pair) => [finalWord(pair.endingA), finalWord(pair.endingB)].sort().join("/"))
        .sort().join("|");
      if (pairKey(option) === pairKey(other)) {
        violations.push(`options ${otherIndex + 1} and ${index + 1} reuse the same rhyme pair`);
      }
    }
  }
  return violations;
}

export function validatePrivateCandidates(
  candidates: PrivateDirectionCandidate[],
  budget: RefrainBudget = {
    sourceRefrain: "",
    sourceWordCount: 16,
    sourceCharacterCount: 92,
    maximumWordCount: 20,
    maximumCharacterCount: 120,
    maximumSentenceCount: 2,
    maximumClauseCount: 2
  }
) {
  if (candidates.length !== DIRECTION_PIPELINE_CONFIG.drafting.candidateCount) {
    throw new DirectionPipelineError("DRAFT_QUALITY_REJECTION", "The draft returned the wrong candidate count.");
  }
  const survivors: Array<PrivateDirectionCandidate & { directionIndex: number }> = [];
  const rejections: Array<{ directionIndex: number; candidate: PrivateDirectionCandidate; reasons: string[] }> = [];
  for (const [directionIndex, candidate] of candidates.entries()) {
    const reasons = [
      ...refrainBudgetViolations(candidate.refrain, budget),
      ...deterministicViolations(candidate.refrain, { requireCompleteSentence: false })
    ];
    const normalized = normalizeRefrain(candidate.refrain);
    if (!normalized) reasons.push("empty after normalization");
    if (survivors.some((other) => nearDuplicate(normalized, normalizeRefrain(other.refrain)))) {
      reasons.push("duplicates or closely paraphrases an earlier candidate");
    }
    if (reasons.length > 0) {
      rejections.push({ directionIndex, candidate, reasons });
      continue;
    }
    survivors.push({ ...candidate, directionIndex });
  }
  if (survivors.length < DIRECTION_PIPELINE_CONFIG.drafting.minimumUsableCandidates) {
    throw new DirectionPipelineError(
      "DRAFT_QUALITY_REJECTION",
      `Only ${survivors.length} private candidates survived deterministic validation.`,
      { rawCandidates: candidates, rejections, budget }
    );
  }
  return { survivors, rejections };
}

export type CachedDirectionDraft = {
  createdAt: number;
  candidates: Array<PrivateDirectionCandidate & { directionIndex: number }>;
  rawCandidates?: PrivateDirectionCandidate[];
  rejections?: Array<{ directionIndex: number; candidate: PrivateDirectionCandidate; reasons: string[] }>;
  budget?: RefrainBudget;
};

export interface DirectionDraftCache {
  read(key: string): Promise<CachedDirectionDraft | null>;
  write(key: string, value: CachedDirectionDraft): Promise<void>;
}

// This is durable across normal local retries and process restarts, but an OS temp
// directory is not guaranteed to survive serverless instance replacement or cleanup.
export const fileDirectionDraftCache: DirectionDraftCache = {
  async read(key) {
    try {
      const raw = JSON.parse(await readFile(join(tmpdir(), "bibaling-direction-drafts", `${key}.json`), "utf8")) as CachedDirectionDraft;
      return Date.now() - raw.createdAt <= DIRECTION_CACHE_TTL_MS ? raw : null;
    } catch {
      return null;
    }
  },
  async write(key, value) {
    const directory = join(tmpdir(), "bibaling-direction-drafts");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${key}.json`), JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  }
};

export function directionDraftCacheKey(input: unknown) {
  return createHash("sha256").update(JSON.stringify({
    input,
    promptVersion: DIRECTION_PROMPT_VERSION,
    validationVersion: DIRECTION_VALIDATION_VERSION,
    config: DIRECTION_PIPELINE_CONFIG.drafting
  })).digest("hex");
}

export async function resolveDirectionDraft(args: {
  key: string;
  freshDraft: boolean;
  cache?: DirectionDraftCache;
  generate: () => Promise<Omit<CachedDirectionDraft, "createdAt">>;
}) {
  const cache = args.cache ?? fileDirectionDraftCache;
  if (!args.freshDraft) {
    const cached = await cache.read(args.key);
    if (cached) return { draft: cached, reused: true };
  }
  const generated = await args.generate();
  const draft = { createdAt: Date.now(), ...generated };
  await cache.write(args.key, draft);
  return { draft, reused: false };
}

export function parentMessageFor(code: DirectionErrorCode) {
  if (code === "DRAFT_TIMEOUT") return "Creating these options is taking longer than expected. Try again.";
  if (code === "DRAFT_OUTPUT_LIMIT" || code === "DRAFT_INVALID_OUTPUT") return "We couldn’t finish creating the options. Let’s try a fresh set.";
  if (code === "DRAFT_QUALITY_REJECTION") return "We couldn’t create three options we felt good about. Let’s try a fresh set.";
  if (code === "EDITOR_TIMEOUT" || code === "EDITOR_OUTPUT_LIMIT" || code === "EDITOR_INVALID_OUTPUT") {
    return "Your options were drafted, but we couldn’t finish reviewing them. Try finishing again.";
  }
  return "We lost the connection while creating your options. Try again.";
}

export function classifyStageFailure(stage: Stage, error: unknown, requestAborted = false) {
  if (error instanceof DirectionPipelineError) return error;
  if (requestAborted) return new DirectionPipelineError("NETWORK_FAILURE", "The client connection was cancelled.", error);
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout|exceeded \d+ms/i.test(message)) {
    return new DirectionPipelineError(stage === "draft" ? "DRAFT_TIMEOUT" : "EDITOR_TIMEOUT", `${stage} request timed out.`, error);
  }
  return new DirectionPipelineError("NETWORK_FAILURE", `${stage} request failed.`, error);
}
