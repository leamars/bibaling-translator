export type PromptEvaluationFixture = {
  id: string;
  source: string;
  priority: "rhythm" | "meaning" | "simple";
  requirements: string[];
  unacceptablePatterns: string[];
};

// These fixtures define constraints, not canonical translations. Every generated
// result still requires review by a native Slovenian children's-book editor.
export const PROMPT_EVALUATION_FIXTURES: PromptEvaluationFixture[] = [
  {
    id: "unrhymed-prose",
    source: "My friend stays beside me when the rain begins.",
    priority: "rhythm",
    requirements: ["Genuine phonetic rhyme", "Natural continuous spoken rhythm", "Preserve companionship and rain"],
    unacceptablePatterns: ["Unrhymed prose split into lines", "Spelling-only rhyme", "Invented shelter or weather events"]
  },
  {
    id: "simple-rhyming-verse",
    source: "You glow in the night; you make the party bright.",
    priority: "rhythm",
    requirements: ["Preserve night, glow, and party function", "Child-appropriate rhyme", "Compatible stress and cadence"],
    unacceptablePatterns: ["Repeated stems as rhyme", "Forced inversion", "Filler added only to close a rhyme"]
  },
  {
    id: "nonportable-wordplay",
    source: "I love you oh-so-MUSH!",
    priority: "meaning",
    requirements: ["Recreate the affectionate joke function", "Remain idiomatic Slovenian", "Fit mushroom imagery"],
    unacceptablePatterns: ["Literal English syntax", "Unexplained English MUSH", "Invented love growing like mushrooms"]
  },
  {
    id: "feminine-mushroom-narrator",
    source: "I am a mushroom, and I am glad you are my friend.",
    priority: "simple",
    requirements: ["Treat goba as grammatically feminine", "Use complete natural Slovenian", "Keep the friendship statement"],
    unacceptablePatterns: ["rad/a", "Masculine rad for the goba narrator", "Gender placeholders"]
  },
  {
    id: "fidelity-rhyme-tension",
    source: "My giant friend is brave and strong—a shelter in the storm.",
    priority: "rhythm",
    requirements: ["Preserve giant friend, courage, strength, shelter, and storm", "Deliver genuine rhyme without semantic drift"],
    unacceptablePatterns: ["Transactional affection", "Invented heart or forever claims", "Dropping shelter to obtain rhyme"]
  }
];
