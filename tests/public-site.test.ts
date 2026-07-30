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

test("all calls to action use the single Translate a book label", async () => {
  const link = await readFile(new URL("../app/components/TranslateLink.tsx", import.meta.url), "utf8");
  const siteFiles = await Promise.all(routes
    .filter((route) => route !== "/translate")
    .map((route) => readFile(routeFile(route), "utf8")));
  assert.match(link, />Translate a book</);
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

test("the illustrated homepage has an intentional mobile layout", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/styles.css", import.meta.url), "utf8");
  await access(new URL("../public/bibaling-family-reading.png", import.meta.url));
  assert.match(page, /bibaling-family-reading\.png/);
  assert.match(page, /className="hero-visual"/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.hero\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
