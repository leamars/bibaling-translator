import {
  resolveLanguageSelection,
  type TargetLanguage
} from "./language-config.ts";

export type LanguageSelection = {
  targetLanguage?: TargetLanguage;
  regionalVariant?: string;
};

export const UNIVERSAL_READ_ALOUD_GUIDANCE = `UNIVERSAL BIBALING READ-ALOUD CONTRACT
- Translate only from the corrected English source.
- Write for a parent reading aloud repeatedly, not for word-for-word equivalence.
- Preserve events, emotional beats, jokes, illustration truth, page turns, address, and approximate density.
- Use complete, idiomatic, contemporary language appropriate for a young child.
- Never invent unsupported actions, objects, settings, motives, metaphors, or emotional claims.
- Never output analysis, instructions, placeholders, slash alternatives, or multiple versions inside one text field.
- Preserve the selected book form. Prose must remain prose; continuous verse must not acquire a fixed refrain; refrain verse must keep the exact parent-approved refrain.
- When rhyme is required, judge it by natural continuous speech in the target language. Natural phrasing and fidelity outrank a forced rhyme.
- The independent editorial pass must repair or replace weak drafts before returning reader-facing text.`;

export function languagePromptGuidance(selection: LanguageSelection = {}) {
  const targetLanguage = selection.targetLanguage || "sl";
  const resolved = resolveLanguageSelection(targetLanguage, selection.regionalVariant);
  return `${UNIVERSAL_READ_ALOUD_GUIDANCE}

LOCKED TARGET LANGUAGE
- Language: ${resolved.config.name}
- BCP 47: ${resolved.languageTag}
${resolved.variant ? `- Regional/script variant: ${resolved.variant.label}\n- ${resolved.variant.guidance}` : "- Regional/script variant: none"}
- Return reader-facing book text only in ${resolved.config.name}. English is allowed only in private strategy labels required by the schema.

LANGUAGE-PACK DRAFTING GUIDANCE
${resolved.config.draftingGuidance}

LANGUAGE-PACK EDITORIAL GUIDANCE
${resolved.config.editorialGuidance}`;
}

export function targetLanguageName(selection: LanguageSelection = {}) {
  return resolveLanguageSelection(selection.targetLanguage || "sl", selection.regionalVariant).config.name;
}

export function isReviewedSlovenian(selection: LanguageSelection = {}) {
  return (selection.targetLanguage || "sl") === "sl";
}
