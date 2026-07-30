import type { BookForm, SourceRhyme } from "../../app/api/book-form-contract.ts";

export type MultilingualEvaluationFixture = {
  id: string;
  category: "prose" | "dialogue" | "verse" | "refrain" | "wordplay" | "baby_language";
  bookForm: BookForm;
  sourceRhyme: SourceRhyme;
  priority: "rhythm" | "meaning" | "simple";
  freedom: "close" | "natural" | "playful";
  source: string;
  visualContext: string;
  approvedRefrain?: string;
  requirements: string[];
};

export const MULTILINGUAL_EVALUATION_FIXTURES: MultilingualEvaluationFixture[] = [
  {
    id: "warm-prose",
    category: "prose",
    bookForm: "prose_story",
    sourceRhyme: "none",
    priority: "rhythm",
    freedom: "natural",
    source: "Mina tucked the blanket under Fox's chin. Outside, the rain tapped softly on the window.",
    visualContext: "A child gently tucks a blanket around a sleepy fox beside a rainy window.",
    requirements: ["Natural prose", "No invented rhyme or line-broken verse", "Preserve the quiet action"]
  },
  {
    id: "dialogue-turn",
    category: "dialogue",
    bookForm: "prose_story",
    sourceRhyme: "none",
    priority: "meaning",
    freedom: "natural",
    source: "“Is that your roar?” asked Bear. “Not yet,” whispered Cub. “I'm still growing it.”",
    visualContext: "A large bear listens while a small cub whispers proudly.",
    requirements: ["Clear speakers", "Preserve the joke", "Natural child dialogue"]
  },
  {
    id: "non-rhyming-verse",
    category: "verse",
    bookForm: "continuous_verse",
    sourceRhyme: "none",
    priority: "rhythm",
    freedom: "natural",
    source: "Moon above.\nRiver below.\nOne silver path\nwhere night birds go.",
    visualContext: "Moonlight forms a silver path over a river as birds cross the sky.",
    requirements: ["Preserve poetic line movement", "Do not invent a fixed refrain", "Rhyme only if natural"]
  },
  {
    id: "refrain-consistency",
    category: "refrain",
    bookForm: "refrain_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "natural",
    source: "Tiny feet, tap-tap-tap!\nOff we go—clap, clap, clap!\nTra-la-la!",
    visualContext: "Three small animals march together and clap.",
    approvedRefrain: "Tra-la-la!",
    requirements: ["Use the approved translated refrain exactly", "Natural spoken rhyme", "Compact repetition"]
  },
  {
    id: "wordplay-rhyme",
    category: "wordplay",
    bookForm: "continuous_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "playful",
    source: "The knight was afraid of the night,\nbut the moon made his gloomy room bright.",
    visualContext: "A toy knight relaxes when moonlight fills a dark bedroom.",
    requirements: ["Recreate the sound-play function rather than literal homophones", "Preserve fear turning to relief", "No forced syntax"]
  },
  {
    id: "baby-language",
    category: "baby_language",
    bookForm: "prose_story",
    sourceRhyme: "none",
    priority: "simple",
    freedom: "close",
    source: "Baby sees Mama. Mama smiles. Up, up, up!",
    visualContext: "A baby reaches up toward a smiling parent.",
    requirements: ["Very simple natural language", "Preserve repetition", "No extra story content"]
  }
];
