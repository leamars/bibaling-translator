import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LANGUAGE_CONFIGS,
  TARGET_LANGUAGE_CODES,
  languageSelectorGroups,
  resolveLanguageSelection,
  selectorValueFor,
  targetLanguageSchema
} from "../app/languages/language-config.ts";

const REMOVED_NON_EUROPEAN = ["hy", "az", "ka", "tr"];
const HIDDEN_LEGACY_VARIANTS = ["es-419", "pt-BR"];

test("the untitled first group holds the strongest-supported languages in the agreed order", () => {
  const { primary } = languageSelectorGroups();
  assert.deepEqual(
    primary.map((entry) => entry.label),
    [
      "Slovenian",
      "German",
      "Spanish — Spain",
      "Italian",
      "Croatian",
      "Serbian — Latin",
      "Serbian — Cyrillic"
    ]
  );
  assert.deepEqual(
    primary.map((entry) => entry.value),
    ["sl", "de", "es:es-ES", "it", "hr", "sr:sr-Latn", "sr:sr-Cyrl"]
  );
});

test("all remaining retained languages appear in the Experimental group and are European", () => {
  const { primary, experimental } = languageSelectorGroups();
  const primaryCodes = new Set(primary.map((entry) => entry.code));
  const expectedExperimental = TARGET_LANGUAGE_CODES.filter((code) => !primaryCodes.has(code));
  assert.deepEqual(experimental.map((entry) => entry.code), expectedExperimental);
  for (const entry of experimental) {
    assert.equal(LANGUAGE_CONFIGS[entry.code].status, "experimental");
  }
});

test("no non-European language appears anywhere in the selector or the schema", () => {
  const { primary, experimental } = languageSelectorGroups();
  const allCodes = [...primary, ...experimental].map((entry) => entry.code as string);
  for (const removed of REMOVED_NON_EUROPEAN) {
    assert.equal(allCodes.includes(removed), false);
    assert.equal((TARGET_LANGUAGE_CODES as readonly string[]).includes(removed), false);
    assert.equal(targetLanguageSchema.safeParse(removed).success, false);
  }
});

test("legacy hidden variant identifiers never reappear as selectable options", () => {
  const { primary, experimental } = languageSelectorGroups();
  const allVariants = [...primary, ...experimental]
    .map((entry) => entry.regionalVariant)
    .filter(Boolean);
  for (const hidden of HIDDEN_LEGACY_VARIANTS) {
    assert.equal(allVariants.includes(hidden), false);
  }
});

test("legacy variant identifiers still parse internally and map back to a visible option", () => {
  // Previously issued receipts and saved selections keep resolving...
  assert.equal(resolveLanguageSelection("es", "es-419").languageTag, "es-419");
  assert.equal(resolveLanguageSelection("pt", "pt-BR").languageTag, "pt-BR");
  // ...but the selector shows the retained European option instead.
  assert.equal(selectorValueFor("es", "es-419"), "es:es-ES");
  assert.equal(selectorValueFor("pt", "pt-BR"), "pt:pt-PT");
  assert.equal(selectorValueFor("sr", "sr-Cyrl"), "sr:sr-Cyrl");
  assert.equal(selectorValueFor("sl"), "sl");
});

test("the selector renders one untitled group and exactly one titled group: Experimental", async () => {
  const translator = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const selectStart = translator.indexOf("id=\"target-language\"");
  const selectEnd = translator.indexOf("</select>", selectStart);
  assert.ok(selectStart >= 0 && selectEnd > selectStart);
  const selector = translator.slice(selectStart, selectEnd);

  // Exactly one optgroup, titled Experimental.
  const optgroups = selector.match(/<optgroup label="([^"]+)"/g) || [];
  assert.deepEqual(optgroups, ["<optgroup label=\"Experimental\""]);

  // The first group is untitled: primary options render before the optgroup,
  // with no heading such as Reviewed, Available, Recommended, or Priority.
  const optgroupIndex = selector.indexOf("<optgroup");
  const beforeGroup = selector.slice(0, optgroupIndex);
  assert.match(beforeGroup, /languageSelectorGroups\(\)\.primary\.map/);
  assert.doesNotMatch(selector, /label="(Reviewed|Available|Recommended|Priority)[^"]*"/i);

  // The old two-titled-group selector and the separate variant control are gone.
  assert.doesNotMatch(translator, /Reviewed and evaluation languages/);
  assert.doesNotMatch(translator, /Regional version/);
});

test("reviewed European guidance fixtures are untouched by the scope change", () => {
  assert.match(LANGUAGE_CONFIGS.sl.editorialGuidance, /Slovenian verse guide/);
  assert.match(LANGUAGE_CONFIGS.de.draftingGuidance, /separable verbs/i);
  assert.match(LANGUAGE_CONFIGS.es.variants?.find((variant) => variant.code === "es-ES")?.guidance ?? "", /vosotros/);
});
