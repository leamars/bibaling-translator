import { z } from "zod";

// European target languages only. The identifiers "hy" (Armenian),
// "az" (Azerbaijani), "ka" (Georgian), and "tr" (Turkish) were removed when
// the product scope was restricted to European languages; a request carrying
// one of them now fails schema validation as an unsupported language.
export const TARGET_LANGUAGE_CODES = [
  "sl", "es", "de", "it", "hr", "sr",
  "sq", "eu", "be", "bs", "bg", "ca", "cs", "da", "nl", "et",
  "fi", "fr", "gl", "el", "hu", "is", "ga", "lv", "lt", "lb", "mk",
  "mt", "cnr", "no", "pl", "pt", "ro", "ru", "sk", "sv", "uk", "cy"
] as const;

export type TargetLanguage = typeof TARGET_LANGUAGE_CODES[number];
export type LanguageStatus = "reviewed" | "priority_evaluation" | "experimental";

export type RegionalVariant = {
  code: string;
  label: string;
  languageTag: string;
  guidance: string;
  // Legacy variants stay resolvable so previously issued receipts and saved
  // identifiers keep parsing, but they are never offered as new selections.
  legacy?: boolean;
};

export type LanguageConfig = {
  code: TargetLanguage;
  name: string;
  autonym: string;
  languageTag: string;
  status: LanguageStatus;
  draftingGuidance: string;
  editorialGuidance: string;
  variants?: readonly RegionalVariant[];
  defaultVariant?: string;
};

const neutral = (name: string) => ({
  draftingGuidance: `Write idiomatic, contemporary ${name} for a parent reading aloud to a young child. Preserve meaning and picture truth; reshape English syntax naturally.`,
  editorialGuidance: `Act as a native children's-book editor in ${name}. Reject literal English syntax, awkward rhyme, invented meaning, and language a parent would not naturally repeat aloud.`
});

export const LANGUAGE_CONFIGS: Record<TargetLanguage, LanguageConfig> = {
  sl: {
    code: "sl", name: "Slovenian", autonym: "slovenščina", languageTag: "sl-SI", status: "reviewed",
    draftingGuidance: `Write grammatical, idiomatic contemporary Slovenian. Resolve grammatical gender without slash forms. For a mushroom called "goba", feminine agreement such as "rada" is required. Poetic word order is acceptable only when natural aloud; never invert solely for rhyme.`,
    editorialGuidance: `Apply the reviewed Slovenian children's-literature standard and Slovenian verse guide. Judge rhyme phonetically under Slovenian stress. Reject Croatianisms when a neutral Slovenian expression exists, English-shaped syntax, malformed words, "čisto do gobic", "rad/a", forced inversion, and invented meaning.`
  },
  es: {
    code: "es", name: "Spanish", autonym: "español", languageTag: "es-ES", status: "priority_evaluation",
    ...neutral("Spanish"),
    defaultVariant: "es-ES",
    variants: [
      { code: "es-ES", label: "Spain", languageTag: "es-ES", guidance: "Use contemporary Spanish as naturally spoken in Spain; use vosotros only where the source relationship supports it." },
      { code: "es-419", label: "Latin America", languageTag: "es-419", guidance: "Use broadly natural Latin American Spanish and ustedes rather than vosotros; avoid narrow country-specific slang.", legacy: true }
    ]
  },
  de: {
    code: "de", name: "German", autonym: "Deutsch", languageTag: "de-DE", status: "priority_evaluation",
    draftingGuidance: `Write neutral contemporary Standard German that is easy to understand across German-speaking regions. Avoid narrow regional colloquialisms. Preserve meaning and picture truth; reshape English syntax naturally.
Prefer natural spoken German clause order. Do not move verbs, objects, particles, or adverbials into marked positions merely to obtain rhyme.
Handle separable verbs as complete semantic units and place their particles naturally for the sentence type. Do not omit or strand a particle for meter.
Prefer transparent, child-friendly compounds. If a grammatically valid compound feels dense or bookish aloud, use a natural short phrase instead.
Preserve who is acting, who is addressed, and whether the source refers to one friend or a group. Avoid pronoun changes introduced only for rhyme.
When a source is sustained rhyming verse, write actual German verse rather than literal prose divided into short lines. Prefer compact lines of roughly 6–10 spoken syllables, smooth cadence, and clearly audible rhyme.
Preserve source wordplay through natural German imagery or speaker-specific language; do not mechanically translate an English pun when German needs a different device.
For prose, do not introduce line-broken verse, meter, rhyme, chants, or a repeated line.`,
    editorialGuidance: `Edit as a native German children's-book editor. Prefer natural spoken clause order, readable compounds, and child-appropriate vocabulary.
For verse, judge rhyme in spoken German from the stressed vowel onward. Infinitive, plural, case, adjective, or other grammatical endings are not sufficient evidence by themselves.
A near rhyme with natural wording is better than exact rhyme created through inversion, filler, semantic weakening, or an unusually literary construction.
For required rhyming verse, independently pronounce every claimed pair in its complete lines. Reject merely visual rhyme, weak consonance presented as rhyme, repeated words, grammatical endings, and unrhymed prose broken into lines.
Reject marked word order used only for rhyme, mishandled separable verbs, dense or bookish compounds, unsupported pronoun changes, stiff filler such as “beglückt” or “entzückt”, and constructions that are grammatical but unnatural aloud.`
  },
  it: {
    code: "it", name: "Italian", autonym: "italiano", languageTag: "it-IT", status: "priority_evaluation",
    ...neutral("Italian"),
    editorialGuidance: "Edit as a native Italian children's-book editor. Protect natural spoken phrasing, agreement, musical cadence, and child-friendly vocabulary; rhyme must never justify filler or inversion."
  },
  hr: {
    code: "hr", name: "Croatian", autonym: "hrvatski", languageTag: "hr-HR", status: "priority_evaluation",
    ...neutral("Croatian"),
    editorialGuidance: "Edit as a native standard Croatian children's-book editor. Use contemporary Croatian morphology and vocabulary consistently; do not drift into Serbian or Slovenian forms."
  },
  sr: {
    code: "sr", name: "Serbian", autonym: "српски / srpski", languageTag: "sr-Cyrl-RS", status: "priority_evaluation",
    ...neutral("Serbian"),
    defaultVariant: "sr-Cyrl",
    variants: [
      { code: "sr-Cyrl", label: "Cyrillic", languageTag: "sr-Cyrl-RS", guidance: "Write the complete reader-facing text in Serbian Cyrillic." },
      { code: "sr-Latn", label: "Latin", languageTag: "sr-Latn-RS", guidance: "Write the complete reader-facing text in Serbian Latin script." }
    ],
    editorialGuidance: "Edit as a native standard Serbian children's-book editor. Keep the selected script consistent and do not drift into Croatian, Bosnian, or Slovenian forms."
  },
  sq: { code: "sq", name: "Albanian", autonym: "shqip", languageTag: "sq-AL", status: "experimental", ...neutral("Albanian") },
  eu: { code: "eu", name: "Basque", autonym: "euskara", languageTag: "eu-ES", status: "experimental", ...neutral("Basque") },
  be: { code: "be", name: "Belarusian", autonym: "беларуская", languageTag: "be-BY", status: "experimental", ...neutral("Belarusian") },
  bs: { code: "bs", name: "Bosnian", autonym: "bosanski", languageTag: "bs-BA", status: "experimental", ...neutral("Bosnian") },
  bg: { code: "bg", name: "Bulgarian", autonym: "български", languageTag: "bg-BG", status: "experimental", ...neutral("Bulgarian") },
  ca: { code: "ca", name: "Catalan", autonym: "català", languageTag: "ca-ES", status: "experimental", ...neutral("Catalan") },
  cs: { code: "cs", name: "Czech", autonym: "čeština", languageTag: "cs-CZ", status: "experimental", ...neutral("Czech") },
  da: { code: "da", name: "Danish", autonym: "dansk", languageTag: "da-DK", status: "experimental", ...neutral("Danish") },
  nl: { code: "nl", name: "Dutch", autonym: "Nederlands", languageTag: "nl-NL", status: "experimental", ...neutral("Dutch") },
  et: { code: "et", name: "Estonian", autonym: "eesti", languageTag: "et-EE", status: "experimental", ...neutral("Estonian") },
  fi: { code: "fi", name: "Finnish", autonym: "suomi", languageTag: "fi-FI", status: "experimental", ...neutral("Finnish") },
  fr: { code: "fr", name: "French", autonym: "français", languageTag: "fr-FR", status: "experimental", ...neutral("French") },
  gl: { code: "gl", name: "Galician", autonym: "galego", languageTag: "gl-ES", status: "experimental", ...neutral("Galician") },
  el: { code: "el", name: "Greek", autonym: "ελληνικά", languageTag: "el-GR", status: "experimental", ...neutral("Greek") },
  hu: { code: "hu", name: "Hungarian", autonym: "magyar", languageTag: "hu-HU", status: "experimental", ...neutral("Hungarian") },
  is: { code: "is", name: "Icelandic", autonym: "íslenska", languageTag: "is-IS", status: "experimental", ...neutral("Icelandic") },
  ga: { code: "ga", name: "Irish", autonym: "Gaeilge", languageTag: "ga-IE", status: "experimental", ...neutral("Irish") },
  lv: { code: "lv", name: "Latvian", autonym: "latviešu", languageTag: "lv-LV", status: "experimental", ...neutral("Latvian") },
  lt: { code: "lt", name: "Lithuanian", autonym: "lietuvių", languageTag: "lt-LT", status: "experimental", ...neutral("Lithuanian") },
  lb: { code: "lb", name: "Luxembourgish", autonym: "Lëtzebuergesch", languageTag: "lb-LU", status: "experimental", ...neutral("Luxembourgish") },
  mk: { code: "mk", name: "Macedonian", autonym: "македонски", languageTag: "mk-MK", status: "experimental", ...neutral("Macedonian") },
  mt: { code: "mt", name: "Maltese", autonym: "Malti", languageTag: "mt-MT", status: "experimental", ...neutral("Maltese") },
  cnr: { code: "cnr", name: "Montenegrin", autonym: "crnogorski", languageTag: "cnr-ME", status: "experimental", ...neutral("Montenegrin") },
  no: { code: "no", name: "Norwegian", autonym: "norsk", languageTag: "nb-NO", status: "experimental", ...neutral("Norwegian Bokmål") },
  pl: { code: "pl", name: "Polish", autonym: "polski", languageTag: "pl-PL", status: "experimental", ...neutral("Polish") },
  pt: {
    code: "pt", name: "Portuguese", autonym: "português", languageTag: "pt-PT", status: "experimental",
    ...neutral("Portuguese"), defaultVariant: "pt-PT",
    variants: [
      { code: "pt-PT", label: "Portugal", languageTag: "pt-PT", guidance: "Use contemporary European Portuguese." },
      { code: "pt-BR", label: "Brazil", languageTag: "pt-BR", guidance: "Use contemporary Brazilian Portuguese.", legacy: true }
    ]
  },
  ro: { code: "ro", name: "Romanian", autonym: "română", languageTag: "ro-RO", status: "experimental", ...neutral("Romanian") },
  ru: { code: "ru", name: "Russian", autonym: "русский", languageTag: "ru-RU", status: "experimental", ...neutral("Russian") },
  sk: { code: "sk", name: "Slovak", autonym: "slovenčina", languageTag: "sk-SK", status: "experimental", ...neutral("Slovak") },
  sv: { code: "sv", name: "Swedish", autonym: "svenska", languageTag: "sv-SE", status: "experimental", ...neutral("Swedish") },
  uk: { code: "uk", name: "Ukrainian", autonym: "українська", languageTag: "uk-UA", status: "experimental", ...neutral("Ukrainian") },
  cy: { code: "cy", name: "Welsh", autonym: "Cymraeg", languageTag: "cy-GB", status: "experimental", ...neutral("Welsh") }
};

export const targetLanguageSchema = z.enum(TARGET_LANGUAGE_CODES);
export const regionalVariantSchema = z.string().max(20).optional();

export function languageConfig(targetLanguage: TargetLanguage) {
  return LANGUAGE_CONFIGS[targetLanguage];
}

export function resolveLanguageSelection(targetLanguage: TargetLanguage, regionalVariant?: string) {
  const config = languageConfig(targetLanguage);
  const selectedCode = regionalVariant || config.defaultVariant;
  const variant = selectedCode ? config.variants?.find((item) => item.code === selectedCode) : undefined;
  if (selectedCode && !variant && config.variants?.length) {
    throw new Error(`Unsupported regional variant ${selectedCode} for ${targetLanguage}`);
  }
  if (regionalVariant && !config.variants?.length) {
    throw new Error(`${config.name} does not accept a regional variant`);
  }
  return {
    config,
    variant,
    languageTag: variant?.languageTag || config.languageTag,
    languagePair: `en-${variant?.code || targetLanguage}`
  };
}

export function languageSelectionLabel(targetLanguage: TargetLanguage, regionalVariant?: string) {
  const { config, variant } = resolveLanguageSelection(targetLanguage, regionalVariant);
  return variant ? `${config.name} · ${variant.label}` : config.name;
}

// ---------------------------------------------------------------------------
// Language selector model: exactly two visual groups.
// The first group carries no heading and holds the strongest-supported
// selections; the second is headed "Experimental". Regional and script
// variants that matter are baked into the first group's entries, so the
// selector needs no separate variant control. Legacy variants (es-419, pt-BR)
// stay resolvable but are never listed.
// ---------------------------------------------------------------------------

export type LanguageSelectorEntry = {
  /** Stable option value: "sl" or "es:es-ES" for variant-bearing entries. */
  value: string;
  code: TargetLanguage;
  regionalVariant?: string;
  label: string;
  autonym: string;
};

export function selectorEntry(code: TargetLanguage, regionalVariant?: string, autonymOverride?: string): LanguageSelectorEntry {
  const { config, variant } = resolveLanguageSelection(code, regionalVariant);
  return {
    value: variant ? `${code}:${variant.code}` : code,
    code,
    ...(variant ? { regionalVariant: variant.code } : {}),
    label: variant ? `${config.name} — ${variant.label}` : config.name,
    autonym: autonymOverride ?? config.autonym
  };
}

const PRIMARY_SELECTOR_ENTRIES: LanguageSelectorEntry[] = [
  selectorEntry("sl"),
  selectorEntry("de"),
  selectorEntry("es", "es-ES", "español"),
  selectorEntry("it"),
  selectorEntry("hr"),
  selectorEntry("sr", "sr-Latn", "srpski"),
  selectorEntry("sr", "sr-Cyrl", "српски")
];

const PRIMARY_CODES = new Set(PRIMARY_SELECTOR_ENTRIES.map((entry) => entry.code));

export function languageSelectorGroups(): {
  primary: LanguageSelectorEntry[];
  experimental: LanguageSelectorEntry[];
} {
  return {
    primary: PRIMARY_SELECTOR_ENTRIES,
    experimental: TARGET_LANGUAGE_CODES
      .filter((code) => !PRIMARY_CODES.has(code))
      .map((code) => selectorEntry(code))
  };
}

/** The selector value for a given saved selection, tolerating legacy variants. */
export function selectorValueFor(targetLanguage: TargetLanguage, regionalVariant?: string) {
  const groups = languageSelectorGroups();
  const entries = [...groups.primary, ...groups.experimental];
  const exact = entries.find((entry) =>
    entry.code === targetLanguage && (entry.regionalVariant ?? undefined) === (regionalVariant || undefined)
  );
  if (exact) return exact.value;
  // Legacy or unlisted variant: fall back to the first entry for the language.
  return entries.find((entry) => entry.code === targetLanguage)?.value ?? targetLanguage;
}
