import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every OpenAI-backed workshop route has a mock bypass", async () => {
  const routes = [
    "app/api/directions/route.ts",
    "app/api/translations/route.ts",
    "app/api/transcribe/route.ts"
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /process\.env\.BIBALING_MOCK_MODE === "true"/);
    assert.match(source, /mock:\s*true/);
  }
});

test("all live Responses calls pass through the controlled request wrapper", async () => {
  const routes = [
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

test("literary calls use the empirically validated 90-second timeout", async () => {
  for (const route of ["app/api/directions/route.ts", "app/api/translations/route.ts"]) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    const controlledCalls = (source.match(/controlledResponse\(\{/g) || []).length;
    const literaryTimeouts = (source.match(/timeoutMs:\s*90_000/g) || []).length;
    assert.equal(literaryTimeouts, controlledCalls);
  }
});

test("direction generation streams genuine progress and propagates cancellation", async () => {
  const source = await readFile(new URL("../app/api/directions/route.ts", import.meta.url), "utf8");
  for (const event of [
    "generation.started",
    "generation.completed",
    "evaluation.started",
    "evaluation.completed",
    "rejection.completed",
    "selection.completed"
  ]) assert.match(source, new RegExp(event.replace(".", "\\.")));
  assert.match(source, /Content-Type": "text\/event-stream/);
  assert.match(source, /streamAbort\.abort\(new Error\("Client disconnected"\)\)/);
});
