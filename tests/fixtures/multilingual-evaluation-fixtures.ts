import type { BookForm, SourceRhyme } from "../../app/api/book-form-contract.ts";

export type MultilingualEvaluationFixture = {
  id: string;
  category: "refrain" | "wordplay" | "verse" | "dialogue" | "baby_language";
  sourceBook: "I Love You So Mush" | "Llama Llama Red Pajama";
  sourceAsset: string;
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
    id: "mush-watch-over",
    category: "refrain",
    sourceBook: "I Love You So Mush",
    sourceAsset: "CleanShot 2026-07-18 at 20.28.05@2x.png",
    bookForm: "refrain_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "natural",
    source: "I love my happy, hairy friend\nwho's nestled on a tree.\n\nI really love you oh-so-MUSH\nfor watching over me.",
    visualContext: "A small mushroom looks up affectionately at a shaggy white forest friend resting in a tree, with a squirrel nearby.",
    approvedRefrain: "I really love you oh-so-MUSH",
    requirements: [
      "Create a natural Spanish recurring line that preserves the affectionate declaration",
      "Keep the watching-over-me relationship and the pictured tree friend",
      "Recreate or replace the English MUSH pun without forcing unnatural Spanish"
    ]
  },
  {
    id: "mush-many-hands",
    category: "verse",
    sourceBook: "I Love You So Mush",
    sourceAsset: "CleanShot 2026-07-18 at 20.28.13@2x.png",
    bookForm: "refrain_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "natural",
    source: "These mushroom friends have many hands\nto hold and spin around.\n\nI really love you oh-so-MUSH!\nYou lift me off the ground!",
    visualContext: "A ring of orange mushrooms hold one another's many arms and spin the smiling narrator mushroom off the ground.",
    approvedRefrain: "I really love you oh-so-MUSH!",
    requirements: [
      "Preserve the collective group, linked hands, spinning motion, and lift",
      "Produce convincing spoken rhyme without distorted Spanish word order",
      "Keep the same chosen recurring declaration used across this book"
    ]
  },
  {
    id: "mush-jiggly-orange",
    category: "wordplay",
    sourceBook: "I Love You So Mush",
    sourceAsset: "Screenshot 2026-07-18 at 20.28.23.png",
    bookForm: "refrain_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "playful",
    source: "I spy my jiggly orange friends.\nIt's fun the way you move.\n\nI really love you oh-so-MUSH!\nYou make the forest groove!",
    visualContext: "Bright yellow-orange jelly fungi wiggle on a tree while the narrator mushroom watches them dance.",
    approvedRefrain: "I really love you oh-so-MUSH!",
    requirements: [
      "Preserve the jelly-like movement, orange friends, and dancing forest image",
      "Recreate the playful move/groove effect naturally rather than literally",
      "Use the exact same approved recurring declaration"
    ]
  },
  {
    id: "llama-bedtime-story",
    category: "verse",
    sourceBook: "Llama Llama Red Pajama",
    sourceAsset: "1.png",
    bookForm: "continuous_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "natural",
    source: "Llama llama\nred pajama\nreads a story\nwith his mama.",
    visualContext: "Mama Llama and Baby Llama sit close together in bed and read a bedtime story.",
    requirements: [
      "Preserve the compact four-line bedtime cadence",
      "Find a natural Spanish sound pattern without inventing a refrain",
      "Keep the affectionate action and clear mother-child relationship"
    ]
  },
  {
    id: "llama-drama",
    category: "dialogue",
    sourceBook: "Llama Llama Red Pajama",
    sourceAsset: "11.png",
    bookForm: "continuous_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "playful",
    source: "Baby Llama,\nwhat a tizzy!\nSometimes Mama's\nvery busy.\n\nPlease stop all this\nllama drama\nand be patient\nfor your mama.",
    visualContext: "Mama Llama speaks firmly but calmly beside the bed while Baby Llama listens and holds a stuffed llama.",
    requirements: [
      "Preserve Mama's direct, firm-but-loving speech",
      "Recreate the tizzy/busy and llama-drama sound play without awkward syntax",
      "Keep the verse easy and natural for a Spanish parent to read aloud"
    ]
  },
  {
    id: "llama-goes-to-sleep",
    category: "baby_language",
    sourceBook: "Llama Llama Red Pajama",
    sourceAsset: "14.png",
    bookForm: "continuous_verse",
    sourceRhyme: "none",
    priority: "simple",
    freedom: "close",
    source: "Baby Llama\ngoes to sleep.",
    visualContext: "Baby Llama sleeps peacefully in bed while cuddling the small stuffed llama.",
    requirements: [
      "Use extremely simple, natural Spanish for a young child",
      "Preserve the quiet final action without adding story content",
      "Do not force rhyme or a repeated refrain into this closing line"
    ]
  }
];
