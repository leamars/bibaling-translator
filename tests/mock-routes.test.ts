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
  assert.match(transcription, /attempt < 2/);
  assert.match(transcription, /transcribe\.fallback/);
  assert.match(transcription, /callCount:\s*2/);
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

test("full-book generation is mocked, bounded, and preserves parent feedback", async () => {
  const route = await readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(route, /input\.mode === "fullbook"/);
  assert.match(route, /assertActionBudget\(\{/);
  assert.match(route, /fullbook\.generate/);
  assert.match(route, /fullbook\.edit/);
  assert.match(page, /parentNote: page\.parentNote/);
  assert.match(page, /Translate the full book/);
  assert.match(page, /onDragEnter/);
  assert.match(page, /These pages are ready\. We’re translating the rest of the book now\./);
  assert.match(page, /approved-while-writing/);
});

test("all long-running client states use non-repeating rotating copy", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(generation, /bibaling_mock_mode=true/);
  assert.match(page, /Mock mode/);
  assert.match(page, /loadMockBook/);
  assert.doesNotMatch(page, />Load a mock book</);
  assert.match(page, /document\.cookie/);
});
