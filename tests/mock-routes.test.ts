import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recoverCompletedTextField } from "../app/api/transcription-recovery.ts";

test("every OpenAI-backed workshop route has a mock bypass", async () => {
  const routes = [
    "app/api/book-form/route.ts",
    "app/api/directions/route.ts",
    "app/api/translations/route.ts",
    "app/api/transcribe/route.ts"
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /isMockRequest\(request\)/);
    assert.match(source, /mock:\s*true/);
  }
});

test("all live Responses calls pass through the controlled request wrapper", async () => {
  const routes = [
    "app/api/book-form/route.ts",
    "app/api/directions/route.ts",
    "app/api/translations/route.ts",
    "app/api/transcribe/route.ts"
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\.responses\.create\(/);
    assert.match(source, /controlledResponse\(/);
  }
});

test("literary calls are bounded, with extra drafting time at the measured bottlenecks", async () => {
  const pipeline = await readFile(new URL("../app/api/direction-pipeline.ts", import.meta.url), "utf8");
  assert.match(pipeline, /model:\s*"gpt-5\.6-sol"[\s\S]*timeoutMs:\s*150_000[\s\S]*maxOutputTokens:\s*5_000/);
  assert.match(pipeline, /editorial:[\s\S]*model:\s*"gpt-5\.6-sol"[\s\S]*timeoutMs:\s*90_000[\s\S]*maxOutputTokens:\s*3_500/);

  const translations = await readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8");
  assert.match(translations, /args\.spreadNumber === 1 && !args\.approvedSpread1 \? 120_000 : 90_000/);
  assert.match(translations, /timeoutMs:\s*requestTimeoutMs/);

  const transcription = await readFile(new URL("../app/api/transcribe/route.ts", import.meta.url), "utf8");
  assert.match(transcription, /timeoutMs:\s*60_000/);
  assert.match(transcription, /gpt-4\.1-mini/);
  assert.match(transcription, /gpt-5\.6-terra/);
  assert.match(transcription, /transcribe\.fallback/);
  assert.match(transcription, /callCount:\s*1/);
  assert.match(transcription, /response\.status !== "completed"/);
  assert.match(transcription, /Transcription completed without output/);
});

test("OCR recovers only a fully completed text field from an interrupted response", () => {
  assert.deepEqual(
    recoverCompletedTextField('{"text":"Mama is in the kitchen.","uncertainty":"'),
    {
      text: "Mama is in the kitchen.",
      uncertainty: "We recovered the complete story text, but could not finish checking the illustration details.",
      visualContext: ""
    }
  );
  assert.equal(recoverCompletedTextField('{"text":"Mama is in the kit'), null);
});

test("translation routes allow an unavailable optional visual summary", async () => {
  const source = await readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8");
  assert.match(source, /const visualContextSchema = z\.string\(\)\.max\(4_000\)/);
  assert.doesNotMatch(source, /visualContext:\s*z\.string\(\)\.min\(1\)/);
  assert.doesNotMatch(source, /visualContexts:\s*z\.array\(z\.string\(\)\.min\(1\)\)/);
});

test("upload-time OCR failures stay per-page and recoverable", async () => {
  const source = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  // Every page is prefetched at upload; one unreadable photo never discards
  // the successful reads around it, and each failed page offers its own retry.
  assert.match(source, /status: "error"/);
  assert.match(source, /spread\.status === "error"/);
  assert.match(source, /onClick=\{\(\) => void prefetchSpreadText\(spread\.id, spread\.preview\)\}>Try again<\/button>/);
  assert.match(source, /Type or paste the English text here/);
});

test("remaining-page OCR prefetch stays invisible until the full-book CTA", async () => {
  const source = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const arrangeScreen = source.slice(source.indexOf("{step === 10"), source.indexOf("{step === 11"));
  const teaserScreen = source.slice(source.indexOf("{step === 11"), source.indexOf("{step === 12"));
  assert.match(source, /prefetchSpreadText/);
  assert.match(source, /Promise\.all\(Array\.from\(spreadReadTasks\.current\.values\(\)\)\)/);
  assert.match(source, /pages: deliverySpreads\.map/);
  assert.doesNotMatch(arrangeScreen, /Reading text/);
  assert.match(teaserScreen, /image-is-reading/);
  assert.match(teaserScreen, /photo-reading-loader/);
  assert.match(teaserScreen, /Reading the words on this page/);
});

test("direction generation streams genuine progress and propagates cancellation", async () => {
  const source = await readFile(new URL("../app/api/directions/route.ts", import.meta.url), "utf8");
  for (const event of [
    "drafting_started",
    "drafting_completed",
    "validating_candidates",
    "editing_started",
    "editing_completed",
    "completed"
  ]) assert.match(source, new RegExp(event.replace(".", "\\.")));
  assert.match(source, /Content-Type": "text\/event-stream/);
  assert.match(source, /streamAbort\.abort\(new Error\("Client disconnected"\)\)/);
});

test("the Page 4 preview is mocked, bounded, quality-gated, and preserves parent feedback", async () => {
  const route = await readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../app/workflows/book-delivery.ts", import.meta.url), "utf8");
  assert.match(route, /input\.mode === "preview"/);
  assert.match(route, /assertActionBudget\(\{/);
  assert.match(route, /preview\.page\.\$\{input\.spread\.spread\}\.generate/);
  assert.match(route, /preview\.page\.\$\{input\.spread\.spread\}\.edit/);
  assert.match(route, /Preview page \$\{input\.spread\.spread\}/); // mock branch
  assert.match(route, /failedFullBookGates/);
  // The interactive full-book mode is gone: delivery is the only whole-book path.
  assert.doesNotMatch(route, /fullbook/);
  // Parent notes flow into the teaser call and the durable delivery input.
  assert.match(page, /parentNote: spread\.parentNote/);
  assert.match(workflow, /parentNote: page\.parentNote/);
});

test("all long-running client states use non-repeating rotating copy", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  assert.match(page, /5000 \+ Math\.floor\(Math\.random\(\) \* 3001\)/);
  assert.match(page, /shuffledMessages\(messages\)/);
  assert.match(page, /readingLoadingMessages/);
  assert.match(page, /translationLoadingMessages/);
  assert.match(page, /patternLoadingMessages/);
  assert.match(page, /fullBookLoadingMessages/);
  assert.match(page, /classificationLoadingMessages/);
  assert.doesNotMatch(page, /<div className="generation-state"/);
});

test("mock mode can be toggled in the UI without restarting the server", async () => {
  const generation = await readFile(new URL("../app/api/generation.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  assert.match(generation, /bibaling_mock_mode=true/);
  assert.match(page, /Mock mode/);
  assert.match(page, /loadMockBook/);
  assert.doesNotMatch(page, />Load a mock book</);
  assert.match(page, /document\.cookie/);
});
