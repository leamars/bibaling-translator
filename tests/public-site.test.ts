import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  "/",
  "/translate",
  "/how-it-works",
  "/languages",
  "/guides",
  "/privacy",
  "/terms",
  "/copyright"
] as const;

function routeFile(route: string) {
  return new URL(route === "/" ? "../app/page.tsx" : `../app${route}/page.tsx`, import.meta.url);
}

test("every public navigation route has a real page", async () => {
  await Promise.all(routes.map((route) => access(routeFile(route))));
});

test("shared header and footer link only to live internal routes", async () => {
  const chrome = await readFile(new URL("../app/components/SiteChrome.tsx", import.meta.url), "utf8");
  const links = [...chrome.matchAll(/\["(\/[^"]*)",\s*"[^"]+"\]/g)].map((match) => match[1]);
  assert.deepEqual(new Set(links), new Set(routes.filter((route) => !["/", "/translate"].includes(route))));
  assert.match(chrome, /href="\/"/);
  assert.match(chrome, /hello@bibaling\.com/);
  assert.match(chrome, /TranslateLink/);
});

test("all calls to action use the single Translate your book label", async () => {
  const link = await readFile(new URL("../app/components/TranslateLink.tsx", import.meta.url), "utf8");
  const siteFiles = await Promise.all(routes
    .filter((route) => route !== "/translate")
    .map((route) => readFile(routeFile(route), "utf8")));
  assert.match(link, /Translate your book/);
  for (const source of siteFiles) {
    assert.doesNotMatch(source, />\s*(Sign up|Get started|Try now)\s*</i);
  }
});

test("UTM attribution and original landing page survive the move to translate", async () => {
  const link = await readFile(new URL("../app/components/TranslateLink.tsx", import.meta.url), "utf8");
  const translator = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  assert.match(link, /utm_source/);
  assert.match(link, /bibaling_attribution/);
  assert.match(link, /bibaling_original_landing_page/);
  assert.match(translator, /sessionStorage\.getItem\("bibaling_original_landing_page"\)/);
});

test("sitewide analytics consent is shared with the email gate", async () => {
  const preference = await readFile(new URL("../app/components/AnalyticsPreference.tsx", import.meta.url), "utf8");
  const translator = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  assert.match(preference, /getAnalyticsConsent/);
  assert.match(preference, /setAnalyticsConsent/);
  assert.match(translator, /bibaling:analytics-consent/);
});

test("the approved playful homepage has human family imagery and an intentional mobile layout", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/homepage.css", import.meta.url), "utf8");
  await access(new URL("../public/images/hero-family.webp", import.meta.url));
  await access(new URL("../public/images/bedtime-reading.webp", import.meta.url));
  assert.match(page, /Read their[\s\S]*favourite books[\s\S]*in your language/);
  assert.match(page, /hero-family\.webp/);
  assert.match(page, /bedtime-reading\.webp/);
  assert.match(page, /We handle the translation/);
  assert.match(page, /You handle bedtime/);
  assert.doesNotMatch(page, /We do the translating|You do the voices|What happens after the first page/);
  assert.match(styles, /@media \(max-width: 780px\)/);
  assert.match(styles, /\.hero\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("homepage uses the editorial title face and two distinct hand-drawn step paths", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/homepage.css", import.meta.url), "utf8");
  assert.match(styles, /--font-title:\s*Georgia/);
  assert.match(styles, /h1,[\s\S]*h2,[\s\S]*h3\s*\{[\s\S]*font-family:\s*var\(--font-title\)/);
  assert.match(styles, /\.faq-list summary\s*\{[\s\S]*font-family:\s*var\(--font-title\)/);
  assert.match(page, /variant="one"/);
  assert.match(page, /variant="two"/);
  assert.match(page, /M2 45C18 16 36 67 57 42C75 21 91 26 118 50/);
  assert.match(page, /M2 42C20 62 34 12 59 35C77 53 93 58 118 25/);
  assert.match(styles, /stroke-dasharray:\s*7 8/);
});

test("homepage book demo pages through balanced Spanish, Slovenian, and German rhymes", async () => {
  const demo = await readFile(new URL("../app/HomeBookDemo.tsx", import.meta.url), "utf8");
  for (const language of ["Español", "Slovenščina", "Deutsch"]) {
    assert.match(demo, new RegExp(language));
  }
  assert.match(demo, /englishLines\.map/);
  assert.match(demo, /translation\.lines\.map/);
  assert.match(demo, /aria-live="polite"/);
  assert.match(demo, /Show previous language/);
  assert.match(demo, /Show next language/);
});
