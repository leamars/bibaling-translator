import type { BookForm, SourceRhyme } from "../../app/api/book-form-contract.ts";
import type { Freedom, Priority } from "../../app/api/translation-prompts.ts";

export type GermanEvaluationPage = {
  pageId: string;
  sourceAsset: string;
  source: string;
  visualContext: string;
};

export type GermanEvaluationFixture = {
  id: string;
  label: string;
  sourceBook: "I Love You So Mush" | "Llama Llama Red Pajama";
  bookForm: BookForm;
  sourceRhyme: SourceRhyme;
  priority: Priority;
  freedom: Freedom;
  routeContractProxy: boolean;
  proxyLimitation?: string;
  pages: GermanEvaluationPage[];
  requirements: string[];
};

export const GERMAN_EVALUATION_FIXTURES: GermanEvaluationFixture[] = [
  {
    id: "mush-refrain-consistency-pair",
    label: "Repeating refrain across two pages",
    sourceBook: "I Love You So Mush",
    bookForm: "refrain_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "natural",
    routeContractProxy: false,
    pages: [
      {
        pageId: "mush-watch-over",
        sourceAsset: "CleanShot 2026-07-18 at 20.28.05@2x.png",
        source: "I love my happy, hairy friend\nwho's nestled on a tree.\n\nI really love you oh-so-MUSH\nfor watching over me.",
        visualContext: "A small mushroom looks up affectionately at a shaggy white forest friend resting in a tree, with a squirrel nearby."
      },
      {
        pageId: "mush-many-hands",
        sourceAsset: "CleanShot 2026-07-18 at 20.28.13@2x.png",
        source: "These mushroom friends have many hands\nto hold and spin around.\n\nI really love you oh-so-MUSH!\nYou lift me off the ground!",
        visualContext: "A ring of orange mushrooms hold one another's many arms and spin the smiling narrator mushroom off the ground."
      }
    ],
    requirements: [
      "Use one exact compact German refrain in both pages",
      "Preserve the affectionate declaration and mushroom wordplay function",
      "Keep singular and collective scene relationships accurate",
      "Preserve page-specific action before or around the refrain in a natural order",
      "Use natural spoken German rhyme without inversion or filler"
    ]
  },
  {
    id: "llama-drama",
    label: "Rhyming verse without a refrain",
    sourceBook: "Llama Llama Red Pajama",
    bookForm: "continuous_verse",
    sourceRhyme: "sustained",
    priority: "rhythm",
    freedom: "playful",
    routeContractProxy: false,
    pages: [{
      pageId: "llama-drama",
      sourceAsset: "11.png",
      source: "Baby Llama,\nwhat a tizzy!\nSometimes Mama's\nvery busy.\n\nPlease stop all this\nllama drama\nand be patient\nfor your mama.",
      visualContext: "Mama Llama speaks firmly but calmly beside the bed while Baby Llama listens and holds a stuffed llama."
    }],
    requirements: [
      "Preserve Mama's direct, firm-but-loving speech",
      "Preserve continuous verse without inventing a repeated refrain",
      "Recreate the sound play with natural spoken German",
      "Use child-appropriate vocabulary and natural clause order",
      "Avoid forced rhyme, marked inversion, or awkward separable-verb placement"
    ]
  },
  {
    id: "llama-goes-to-sleep-prose-proxy",
    label: "Prose route-contract proxy",
    sourceBook: "Llama Llama Red Pajama",
    bookForm: "prose_story",
    sourceRhyme: "none",
    priority: "simple",
    freedom: "close",
    routeContractProxy: true,
    proxyLimitation: "This real page is a plain unrhymed sentence inside a poetic book. It tests that the prose_story route avoids invented verse; it is not evidence of quality on genuine prose picture books.",
    pages: [{
      pageId: "llama-goes-to-sleep",
      sourceAsset: "14.png",
      source: "Baby Llama\ngoes to sleep.",
      visualContext: "Baby Llama sleeps peacefully in bed while cuddling the small stuffed llama."
    }],
    requirements: [
      "Use extremely simple natural German for a young child",
      "Preserve only the quiet final action",
      "Do not add rhyme, meter, line-broken verse, a chant, or a refrain",
      "Do not add story content or a regional expression"
    ]
  }
];
