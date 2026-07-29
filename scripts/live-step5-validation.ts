import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const TOTAL_TIMEOUT_MS = 255_000;
const MAX_ESTIMATED_COST_USD = 0.295;
const AUTOMATIC_RETRIES = 0;

const source = [
  "I love my happy, hairy friend who's nestled on a tree.\nI really love you oh-so-MUSH for watching over me.",
  "These mushroom friends have many hands to hold and spin around.\nI really love you oh-so-MUSH! You lift me off the ground!",
  "I spy my jiggly orange friends.\nIt's fun the way you move.\nI really love you oh-so-MUSH!"
];
const visualContexts = [
  "A friendly mushroom narrator looks toward a large hairy forest friend resting beside a tree.",
  "Orange mushroom friends hold hands in a circle and spin around the central mushroom.",
  "The mushroom narrator watches bright orange friends moving playfully in the forest."
];

const fixtures = {
  rhythm: {
    priority: "rhythm",
    freedom: "natural",
    parentFeedback: "Give us three imaginatively different refrain forms with genuine spoken Slovenian rhyme."
  },
  meaning: {
    priority: "meaning",
    freedom: "close",
    parentFeedback: "Keep the collective affection and picture truth while varying the refrain structure."
  },
  simple: {
    priority: "simple",
    freedom: "playful",
    parentFeedback: "Use clear child-friendly Slovenian while giving the options noticeably different energy."
  }
} as const;

const fixtureName = process.argv[2] as keyof typeof fixtures;
if (!(fixtureName in fixtures)) {
  throw new Error(`Choose one fixture: ${Object.keys(fixtures).join(", ")}`);
}
const confirmation = `RUN_${fixtureName.toUpperCase()}`;
if (process.env.CONFIRM_STEP5_LIVE !== confirmation) {
  throw new Error(`Live call blocked. Set CONFIRM_STEP5_LIVE=${confirmation} only after explicit approval.`);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error("Live Step 5 validation exceeded its total bound.")), TOTAL_TIMEOUT_MS);
process.once("SIGINT", () => controller.abort(new Error("Interrupted by reviewer.")));
const startedAt = Date.now();
const events: Array<Record<string, unknown>> = [];

try {
  const response = await fetch("http://localhost:3000/api/directions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "x-bibaling-live-evaluation": "true"
    },
    signal: controller.signal,
    body: JSON.stringify({
      texts: source,
      visualContexts,
      ...fixtures[fixtureName],
      previousRefrains: [],
      freshDraft: true
    })
  });
  if (!response.ok || !response.body) throw new Error(`Step 5 route returned HTTP ${response.status}.`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const line = block.split("\n").find((item) => item.startsWith("data: "));
      if (line) events.push(JSON.parse(line.slice(6)));
    }
  }

  const result = events.find((event) => event.type === "result") as any;
  const failure = events.find((event) => event.type === "error");
  const usage = events
    .map((event) => event.usage)
    .filter(Boolean) as Array<Record<string, number>>;
  const directions = result?.data?.runs?.flatMap((run: any) => run.directions) ?? [];
  const artifact = {
    fixture: fixtureName,
    promptVersion: "step5-v8-assigned-observable-constructions",
    configuration: {
      draftModel: "gpt-5.6-sol",
      draftTimeoutMs: 150_000,
      draftOutputLimit: 5_000,
      privateCandidates: 5,
      editorModel: "gpt-5.6-sol",
      editorTimeoutMs: 90_000,
      editorOutputLimit: 3_500,
      finalOptions: 3,
      automaticRetries: AUTOMATIC_RETRIES,
      maximumEstimatedCostUsd: MAX_ESTIMATED_COST_USD
    },
    completed: Boolean(result) && !failure && directions.length === 3,
    totalLatencyMs: Date.now() - startedAt,
    stages: events,
    usage,
    reachedOutputAllowance: usage.some((item, index) =>
      item.outputTokens >= (index === 0 ? 5_000 : 3_500)
    ),
    candidateCountEnteringEditor: (events.find((event) => event.event === "editing_started") as any)?.candidateCount,
    sourceRefrain: result?.data?.evaluationDiagnostics?.budget?.sourceRefrain ?? (failure as any)?.evaluationDiagnostics?.budget?.sourceRefrain,
    refrainBudget: result?.data?.evaluationDiagnostics?.budget ?? (failure as any)?.evaluationDiagnostics?.budget,
    rawCandidates: result?.data?.evaluationDiagnostics?.rawCandidates ?? (failure as any)?.evaluationDiagnostics?.rawCandidates,
    survivors: result?.data?.evaluationDiagnostics?.survivors ?? (failure as any)?.evaluationDiagnostics?.survivors,
    rejectedCandidates: result?.data?.evaluationDiagnostics?.rejections ?? (failure as any)?.evaluationDiagnostics?.rejections,
    editorialOptions: result?.data?.evaluationDiagnostics?.editorialOptions ?? (failure as any)?.evaluationDiagnostics?.editorialOptions,
    finalOptionCount: directions.length,
    finalDirections: directions,
    failure: failure ?? null
  };
  const directory = resolve("artifacts/live-step5");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}-${fixtureName}.json`);
  await writeFile(path, JSON.stringify(artifact, null, 2));
  process.stdout.write(`${JSON.stringify({ artifact: path, ...artifact }, null, 2)}\n`);
  if (!artifact.completed) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
