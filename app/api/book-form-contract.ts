export const BOOK_FORMS = ["prose_story", "continuous_verse", "refrain_verse"] as const;
export type BookForm = typeof BOOK_FORMS[number];

export const SOURCE_RHYME = ["none", "occasional", "sustained", "uncertain"] as const;
export type SourceRhyme = typeof SOURCE_RHYME[number];

export type BookFormAnalysis = {
  bookForm: BookForm;
  confidence: number;
  explanation: string;
  sourceRhyme: SourceRhyme;
};

export const BOOK_FORM_OPTIONS: Array<{
  value: BookForm;
  title: string;
  description: string;
}> = [
  {
    value: "prose_story",
    title: "A story, not a poem",
    description: "No regular rhyme or repeated line. We’ll protect the storytelling voice, meaning, and picture details."
  },
  {
    value: "continuous_verse",
    title: "A rhyming or poetic story",
    description: "The language moves like a poem, but no line repeats. We’ll preserve its poetic movement without adding a refrain."
  },
  {
    value: "refrain_verse",
    title: "Verse with a repeating refrain",
    description: "A line or chant comes back. We’ll solve that wording first, then build the rest of the voice around it."
  }
];

export function bookFormLabel(bookForm: BookForm) {
  return BOOK_FORM_OPTIONS.find((option) => option.value === bookForm)?.title ?? bookForm;
}

export function requiresRhyme(args: {
  bookForm: BookForm;
  sourceRhyme: SourceRhyme;
  priority: "rhythm" | "meaning" | "simple";
}) {
  if (args.bookForm === "prose_story") return false;
  if (args.bookForm === "continuous_verse") return args.sourceRhyme === "sustained";
  return args.priority === "rhythm" || args.sourceRhyme === "sustained";
}

export function nextAfterFreedom(bookForm: BookForm) {
  return bookForm === "refrain_verse" ? "refrain_lab" : "page1";
}

export function page1BackStep(bookForm: BookForm) {
  return bookForm === "refrain_verse" ? 6 : 5;
}

export function workshopProgress(bookForm: BookForm | null, internalStep: number) {
  const refrainRoute = bookForm === "refrain_verse";
  const total = refrainRoute ? 11 : 10;
  const current = !refrainRoute && internalStep >= 7 ? internalStep - 1 : internalStep;
  return { current: Math.min(current, total), total };
}

function normalizedUnits(text: string) {
  return text
    .split(/\n|(?<=[.!?])\s+/u)
    .map((unit) => unit.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function hasRecurringMeaningfulLine(texts: string[]) {
  const appearances = new Map<string, Set<number>>();
  texts.forEach((text, sample) => {
    for (const unit of new Set(normalizedUnits(text))) {
      if (unit.split(" ").length < 4) continue;
      const samples = appearances.get(unit) ?? new Set<number>();
      samples.add(sample);
      appearances.set(unit, samples);
    }
  });
  return [...appearances.values()].some((samples) => samples.size >= 2);
}

function plausibleWrittenRhyme(texts: string[]) {
  let pairs = 0;
  let matches = 0;
  for (const text of texts) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    for (let index = 1; index < lines.length; index += 2) {
      const first = lines[index - 1].toLocaleLowerCase("en").match(/[\p{L}]+(?=[^\p{L}]*$)/u)?.[0] ?? "";
      const second = lines[index].toLocaleLowerCase("en").match(/[\p{L}]+(?=[^\p{L}]*$)/u)?.[0] ?? "";
      if (!first || !second) continue;
      pairs += 1;
      if (first.slice(-2) === second.slice(-2) || first.slice(-3) === second.slice(-3)) matches += 1;
    }
  }
  return pairs > 0 && matches / pairs >= 0.5;
}

// Interface-test fixture logic only. Production classification is model-backed.
export function mockBookFormAnalysis(texts: string[]): BookFormAnalysis {
  if (hasRecurringMeaningfulLine(texts)) {
    return {
      bookForm: "refrain_verse",
      confidence: 0.96,
      explanation: "The same meaningful line returns across the samples.",
      sourceRhyme: plausibleWrittenRhyme(texts) ? "sustained" : "occasional"
    };
  }
  const poetic = texts.some((text) => text.includes("\n"));
  if (poetic) {
    const rhyming = plausibleWrittenRhyme(texts);
    return {
      bookForm: "continuous_verse",
      confidence: 0.9,
      explanation: "The samples use poetic line structure without a fixed recurring line.",
      sourceRhyme: rhyming ? "sustained" : "none"
    };
  }
  return {
    bookForm: "prose_story",
    confidence: 0.9,
    explanation: "The samples read as continuous storytelling rather than verse.",
    sourceRhyme: "none"
  };
}

export function bookFormClassifierPrompt(args: { texts: string[]; visualContexts: string[] }) {
  return `Classify the literary form of these three corrected English picture-book samples.

Return structured JSON only with:
- bookForm: prose_story, continuous_verse, or refrain_verse
- confidence: a number from 0 to 1
- explanation: one short parent-facing English sentence
- sourceRhyme: none, occasional, sustained, or uncertain

Definitions:
- prose_story: ordinary prose storytelling, without sustained verse structure or a meaningful fixed recurring line.
- continuous_verse: continuous poetic language, rhythm, line structure, sound play, meter, or rhyme, but no fixed recurring refrain.
- refrain_verse: a substantially identical meaningful declaration, question-and-answer, chant, or line intentionally recurs across samples.

Be conservative about refrain_verse. Repeated themes, character names, grammatical connective phrases, generic sentence frames, or similar-but-different sentences are not a refrain. Recommend refrain_verse only when substantially the same meaningful wording functions as a recurring book device.

Judge sourceRhyme separately from bookForm. A continuous_verse source may be poetic without end rhyme. Do not infer rhyme from spelling alone.

CORRECTED ENGLISH SAMPLES
${args.texts.map((text, index) => `${index + 1}. ${text}`).join("\n")}

EXISTING VISUAL CONTEXT
${args.visualContexts.map((context, index) => `${index + 1}. ${context}`).join("\n")}`;
}
