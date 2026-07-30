import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function sources() {
  return {
    page: await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8"),
    styles: await readFile(new URL("../app/translator.css", import.meta.url), "utf8"),
    chrome: await readFile(new URL("../app/components/SiteChrome.tsx", import.meta.url), "utf8"),
    analytics: await readFile(new URL("../app/analytics.ts", import.meta.url), "utf8")
  };
}

test("translator carries the approved editorial palette and title system through every step", async () => {
  const { page, styles } = await sources();
  assert.match(page, /translator-step-\$\{step\}/);
  assert.match(page, /workshop-orientation/);
  assert.match(styles, /--ink:\s*#172544/);
  assert.match(styles, /--coral:\s*#ff6b5f/);
  assert.match(styles, /--sun:\s*#ffd95c/);
  assert.match(styles, /--sky:\s*#82c9ff/);
  assert.match(styles, /--pink:\s*#ff9fc9/);
  assert.match(styles, /\.translator-shell h1\s*\{[\s\S]*font-family:\s*Georgia/);
  assert.match(styles, /font-size:\s*clamp\(36px,\s*5vw,\s*52px\)/);
  assert.match(styles, /\.translator-shell \.primary\s*\{[\s\S]*color:\s*var\(--ink\)[\s\S]*background:\s*var\(--sun\)/);
});

test("all visible translator states have intentional compositions rather than one generic card treatment", async () => {
  const { page, styles } = await sources();
  for (const state of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.match(page, new RegExp(`step === ${state}`));
  }
  for (const component of [
    "upload-onboarding",
    "transcription",
    "choice",
    "direction-progress-log",
    "direction-card",
    "source-card",
    "option-card",
    "email-gate",
    "generation-error",
    "image-lightbox"
  ]) {
    assert.ok(styles.includes(`.${component}`), `missing visual treatment for ${component}`);
  }
  assert.match(styles, /\.choice:nth-child\(3n \+ 1\)/);
  assert.match(styles, /\.direction-card:nth-child\(3n \+ 1\)/);
  assert.match(styles, /\.email-gate\s*\{[\s\S]*background:\s*var\(--sun\)/);
});

test("translator remains keyboard-visible, reduced-motion safe, and mobile-action oriented", async () => {
  const { page, styles } = await sources();
  assert.match(page, /role="progressbar"/);
  assert.match(page, /aria-valuemax=\{progress\.total\}/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(styles, /:focus-visible[\s\S]*outline:\s*3px solid #3154d8/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*nav\s*\{[\s\S]*position:\s*sticky/);
  assert.match(styles, /body:has\(\.translator-shell\)\s*\{\s*overflow-x:\s*hidden/);
  assert.match(styles, /text-wrap:\s*balance/);
});

test("translator uses one compact header and keeps the approved image-first upload behavior", async () => {
  const { page, chrome, styles } = await sources();
  assert.match(chrome, /pathname === "\/translate"/);
  assert.match(page, /brand-mark/);
  assert.match(page, /spreads\.length \? "Add more book photos" : "Add all book photos"/);
  assert.match(page, /className=\{spreads\.length \? "uploads" : "uploads empty"\}/);
  assert.match(page, /className="photo"/);
  assert.match(page, />Replace</);
  assert.doesNotMatch(page, /No image yet|Choose file/);
  assert.match(styles, /\.drop\s*\{[\s\S]*radial-gradient/);
  assert.match(styles, /\.photo img\s*\{[^}]*object-fit:\s*cover/);
});

test("provided GA4 property remains dynamically loaded only after explicit consent", async () => {
  const { analytics } = await sources();
  assert.match(analytics, /G-EK8PPEVG54/);
  assert.match(analytics, /if \(!configured\(\) \|\| !consented\(\) \|\| !window\.gtag\) return/);
  assert.match(analytics, /if \(!granted\)[\s\S]*analytics_storage:\s*"denied"/);
  assert.match(analytics, /ensureTag\(\)/);
  assert.doesNotMatch(analytics, /email_address|filename|translation_text|jobToken|signed_receipt/);
});
