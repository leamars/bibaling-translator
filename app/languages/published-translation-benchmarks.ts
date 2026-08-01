import type { TargetLanguage } from "./language-config.ts";

export type BenchmarkEvidenceKind =
  | "publisher"
  | "library_catalogue"
  | "bookseller_preview"
  | "reader_photo"
  | "review"
  | "translator_interview";

export type PublishedTranslationBenchmark = {
  id: string;
  targetLanguage: Extract<TargetLanguage, "de" | "es" | "it" | "hr" | "sr">;
  originalTitle: string;
  publishedTitle: string;
  translator?: string;
  publisher?: string;
  isbn?: string;
  evidence: readonly {
    kind: BenchmarkEvidenceKind;
    url: string;
    note: string;
  }[];
  confirmedExcerpts?: readonly string[];
  transferableTechniques: readonly string[];
};

/**
 * A deliberately small, provenance-bearing reference set. Short excerpts are
 * included only when the wording was supplied by the user or independently
 * visible in a public source. This is not a corpus and must not be expanded by
 * reconstructing books from read-alouds, photos, or search snippets.
 */
export const PUBLISHED_TRANSLATION_BENCHMARKS: readonly PublishedTranslationBenchmark[] = [
  {
    id: "de-llama-llama-red-pajama",
    targetLanguage: "de",
    originalTitle: "Llama Llama Red Pajama",
    publishedTitle: "Lama Lama im Pyjama",
    translator: "Christiane Steen",
    publisher: "Rowohlt Rotfuchs",
    isbn: "978-3-499-00080-5",
    evidence: [
      {
        kind: "reader_photo",
        url: "https://www.amazon.co.uk/Lama-im-Pyjama-Anna-Dewdney/dp/3499000806#averageCustomerReviewsAnchor",
        note: "Customer images supplied by the user show interior pages."
      },
      {
        kind: "review",
        url: "https://literaturwerkstattkreativblog.wordpress.com/2019/09/07/lama-lama-im-pyjama-von-anna-dewdney/",
        note: "Review reproduces short passages from the German edition."
      },
      {
        kind: "review",
        url: "https://www.knappenblog.at/2019/09/lama-lama-im-pyjama.html",
        note: "Review reproduces a short passage near the ending."
      }
    ],
    confirmedExcerpts: [
      "Lama Lama im Pyjama\nliest ein Buch mit seiner Mama.",
      "Gute Nacht, nun schlaf recht schön,\nMama muss jetzt runtergehen.",
      "Lama Lama im Pyjama\nquengelt leis nach seiner Mama.",
      "Lama Lama, hör mal zu.\nMama Lama braucht jetzt Ruh.\nKann nicht immer bei dir sein,\nlass dich aber niemals allein."
    ],
    transferableTechniques: [
      "Drop a low-priority modifier when that unlocks a much stronger native hook; the German title omits 'red'.",
      "Build repeated lines around an abundant native rhyme family: Lama / Pyjama / Mama.",
      "Use compact, ordinary bedtime language and vary the line after the recurring anchor."
    ]
  },
  {
    id: "de-the-gruffalo",
    targetLanguage: "de",
    originalTitle: "The Gruffalo",
    publishedTitle: "Der Grüffelo",
    translator: "Monika Osberghaus",
    publisher: "Beltz & Gelberg",
    evidence: [
      {
        kind: "publisher",
        url: "https://www.beltz.de/kinderbuch_jugendbuch/produkte/details/717-der-grueffelo.html",
        note: "Publisher edition record."
      }
    ],
    transferableTechniques: [
      "Recreate an invented name so its sounds and inflections work naturally in German.",
      "Protect the cumulative story structure and spoken momentum instead of mirroring English syntax."
    ]
  },
  {
    id: "es-llama-llama-red-pajama",
    targetLanguage: "es",
    originalTitle: "Llama Llama Red Pajama",
    publishedTitle: "La llama llama rojo pijama",
    publisher: "Viking Books for Young Readers",
    isbn: "978-0-425-29039-2",
    evidence: [
      {
        kind: "publisher",
        url: "https://www.penguinrandomhouseretail.com/book/?isbn=9780425290392",
        note: "Publisher catalogue record for the Spanish edition."
      }
    ],
    transferableTechniques: [
      "Keep a semantically vivid title phrase when Spanish can still support a strong llama / drama sound pattern.",
      "Treat repetition as a musical anchor, not as a demand for identical surrounding syntax."
    ]
  },
  {
    id: "es-the-gruffalo",
    targetLanguage: "es",
    originalTitle: "The Gruffalo",
    publishedTitle: "El Grúfalo",
    publisher: "Bruño",
    isbn: "978-84-696-6327-1",
    evidence: [
      {
        kind: "bookseller_preview",
        url: "https://uae.kinokuniya.com/Julia_Donaldson_Books_in_Spanish_%3A_El_Grufalo/bw/9788469663271",
        note: "Edition metadata for the current Spanish hardcover."
      }
    ],
    transferableTechniques: [
      "Naturalize an invented creature name with Spanish stress and orthography.",
      "Preserve comic escalation and refrain-like returns while allowing flexible line-level wording."
    ]
  },
  {
    id: "it-the-gruffalo",
    targetLanguage: "it",
    originalTitle: "The Gruffalo",
    publishedTitle: "Il Gruffalò",
    publisher: "Emme Edizioni",
    evidence: [
      {
        kind: "library_catalogue",
        url: "https://www.culturabologna.it/objects/il-gruffalo-julia-donaldson-illustrato-da-axel-scheffler",
        note: "Italian library catalogue record."
      }
    ],
    transferableTechniques: [
      "Move the invented name's stress so it is immediately pronounceable and musical in Italian.",
      "Favor open-vowel cadence and idiomatic word order over English-shaped line matching."
    ]
  },
  {
    id: "it-room-on-the-broom",
    targetLanguage: "it",
    originalTitle: "Room on the Broom",
    publishedTitle: "La strega Rossella",
    publisher: "Emme Edizioni",
    isbn: "978-88-6714-434-1",
    evidence: [
      {
        kind: "library_catalogue",
        url: "https://www.sbhu.it/proposte-di-lettura/julia-donaldson/",
        note: "Library bibliography records the Italian edition."
      }
    ],
    transferableTechniques: [
      "Replace an unportable English title pun with a memorable, rhyme-friendly character name.",
      "Recreate the book's buoyant motion through native cadence rather than literal title wording."
    ]
  },
  {
    id: "hr-the-gruffalo",
    targetLanguage: "hr",
    originalTitle: "The Gruffalo",
    publishedTitle: "Grubzon",
    translator: "Krešimir Krnic",
    evidence: [
      {
        kind: "translator_interview",
        url: "https://miss7mama.24sata.hr/vrtic/stize-nastavak-grubzona-razgovarali-smo-s-prevoditeljem-koji-je-smislio-ime-slavnom-liku-19887",
        note: "Translator interview about naming, rhythm, and rhyme decisions."
      }
    ],
    transferableTechniques: [
      "Invent names anew when necessary so sound symbolism, morphology, rhythm, and rhyme work in Croatian.",
      "Aim to give the Croatian reader the same literary experience, not the same sequence of words."
    ]
  },
  {
    id: "hr-the-gruffalos-child",
    targetLanguage: "hr",
    originalTitle: "The Gruffalo's Child",
    publishedTitle: "Grubzonovo dijete",
    translator: "Krešimir Krnic",
    evidence: [
      {
        kind: "translator_interview",
        url: "https://miss7mama.24sata.hr/vrtic/stize-nastavak-grubzona-razgovarali-smo-s-prevoditeljem-koji-je-smislio-ime-slavnom-liku-19887",
        note: "Translator interview covering the Croatian sequel and its relationship to Grubzon."
      }
    ],
    transferableTechniques: [
      "Keep coined names morphologically productive so sequels and family relationships remain natural.",
      "Carry forward established rhythm and terminology consistently across a series."
    ]
  },
  {
    id: "sr-the-gruffalo",
    targetLanguage: "sr",
    originalTitle: "The Gruffalo",
    publishedTitle: "Grozon",
    evidence: [
      {
        kind: "review",
        url: "https://lonacslikovnica.com/2019/07/07/grozon/",
        note: "Detailed Serbian edition review and identification."
      }
    ],
    transferableTechniques: [
      "Coin a Serbian creature name that sounds expressive and can take ordinary case endings.",
      "Preserve the oral storytelling pattern and comic threat rather than transliterating the English name."
    ]
  },
  {
    id: "sr-the-gruffalos-child",
    targetLanguage: "sr",
    originalTitle: "The Gruffalo's Child",
    publishedTitle: "Grozonovo dete",
    evidence: [
      {
        kind: "review",
        url: "https://lonacslikovnica.com/2019/07/07/grozon/",
        note: "Serbian review situates the translated series and its coined name."
      }
    ],
    transferableTechniques: [
      "Choose coined names that remain usable in possessives and related titles.",
      "Keep the selected Serbian script consistent while preserving playful spoken rhythm."
    ]
  }
] as const;

export function publishedTranslationBenchmarksFor(targetLanguage: TargetLanguage) {
  return PUBLISHED_TRANSLATION_BENCHMARKS.filter(
    (benchmark) => benchmark.targetLanguage === targetLanguage
  );
}

export function publishedTranslationBenchmarkPrompt(targetLanguage: TargetLanguage) {
  const benchmarks = publishedTranslationBenchmarksFor(targetLanguage);
  if (!benchmarks.length) return "";

  const entries = benchmarks.map((benchmark) => {
    const excerpts = benchmark.confirmedExcerpts?.length
      ? `\n  Confirmed short excerpts (technique evidence only):\n${benchmark.confirmedExcerpts
          .map((excerpt) => `  ---\n${excerpt.split("\n").map((line) => `  ${line}`).join("\n")}\n  ---`)
          .join("\n")}`
      : "";
    return `- ${benchmark.originalTitle} → ${benchmark.publishedTitle}${
      benchmark.translator ? `, translated by ${benchmark.translator}` : ""
    }\n  Transferable choices:\n${benchmark.transferableTechniques
      .map((technique) => `  - ${technique}`)
      .join("\n")}${excerpts}`;
  });

  return `PUBLISHED-TRANSLATION BENCHMARKS
These are evidence about how professional translators solve children's-book problems in the selected language. Learn from the techniques, not the wording.
- Do not copy an excerpt into another book or use this material as a phrase bank.
- Do not continue, reconstruct, or imitate unlisted text from any published edition.
- Do not assume a benchmark is the user's source book; the current lookup is language-based, not title-aware.
- Fidelity to the user's corrected English source and illustrations always outranks similarity to a benchmark.

${entries.join("\n\n")}`;
}
