import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_VERSION,
  normalizeRestoredStep,
  parseWorkshopSnapshot,
  workshopSnapshotSchema,
  type WorkshopSnapshot
} from "../app/translate/workshop-storage.ts";

function snapshot(overrides: Partial<WorkshopSnapshot> = {}): WorkshopSnapshot {
  return workshopSnapshotSchema.parse({
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    step: 9,
    targetLanguage: "es",
    regionalVariant: "es-ES",
    languageConfirmed: true,
    priority: "rhythm",
    freedom: "natural",
    bookForm: "refrain_verse",
    recommendedBookForm: "refrain_verse",
    bookFormConfirmed: true,
    bookFormExplanation: "The same meaningful line returns across the samples.",
    sourceRhyme: "sustained",
    spreads: [1, 2, 3, 4].map((page) => ({
      id: `spread-${page}`,
      thumbnail: "data:image/jpeg;base64,dGh1bWI=",
      text: `Corrected English for page ${page}.`,
      uncertainty: null,
      visualContext: `Scene ${page}.`,
      error: null,
      status: "done" as const
    })),
    directions: [{
      name: "Warm declaration",
      refrain: "Prijatelji moji, rada vas imam.",
      approach: "A compact closing declaration.",
      genderDependency: "Feminine narrator.",
      modelLabel: "Sol · quality-first"
    }],
    selectedDirection: 0,
    shownRefrains: ["Prijatelji moji, rada vas imam."],
    lockedDirection: {
      name: "Warm declaration",
      refrain: "Prijatelji moji, rada vas imam.",
      approach: "A compact closing declaration.",
      genderDependency: "Feminine narrator.",
      modelLabel: "Sol · quality-first"
    },
    spread1Options: [{
      strategy: "Direct declaration",
      text: "Prva stran v slovenščini.",
      modelLabel: "Sol · quality-first",
      originalText: "Prva stran v slovenščini.",
      editNote: ""
    }],
    spread1Selection: 0,
    approvedSpread1: "Prva stran v slovenščini.",
    patternOptions: { "2": [], "3": [] },
    patternSelections: { "2": 0, "3": 0 },
    approvedDrafts: { "1": "Prva stran.", "2": "Druga stran.", "3": "Tretja stran." },
    approvedNotes: { "1": "Lepo zveni." },
    teaser: { status: "idle", page: null },
    ...overrides
  });
}

test("a saved workshop round-trips through serialization intact", () => {
  const original = snapshot();
  const restored = parseWorkshopSnapshot(JSON.stringify(original));
  assert.deepEqual(restored, original);
});

test("malformed, stale, and differently versioned snapshots are rejected", () => {
  assert.equal(parseWorkshopSnapshot(null), null);
  assert.equal(parseWorkshopSnapshot("not json"), null);
  assert.equal(parseWorkshopSnapshot(JSON.stringify({ hello: "world" })), null);
  assert.equal(
    parseWorkshopSnapshot(JSON.stringify({ ...snapshot(), version: SNAPSHOT_VERSION + 1 })),
    null
  );
  assert.equal(
    parseWorkshopSnapshot(JSON.stringify(snapshot({ savedAt: Date.now() - SNAPSHOT_MAX_AGE_MS - 1 }))),
    null
  );
});

test("a snapshot saved mid-teaser restores at rest", () => {
  const restored = parseWorkshopSnapshot(JSON.stringify(snapshot({
    teaser: { status: "writing", page: null }
  })));
  assert.deepEqual(restored?.teaser, { status: "idle", page: null });
});

test("the snapshot never contains the email address, consents, tokens, or full photos", async () => {
  const keys = Object.keys(workshopSnapshotSchema.shape);
  for (const forbidden of ["email", "marketingConsent", "analyticsConsent", "leadReceipt", "jobToken", "deliveryJob", "mockMode"]) {
    assert.equal(keys.includes(forbidden), false, `snapshot must not persist ${forbidden}`);
  }
  const storage = await readFile(new URL("../app/translate/workshop-storage.ts", import.meta.url), "utf8");
  // Identifier-level scan (the module comment legitimately explains the
  // privacy posture in prose).
  assert.doesNotMatch(storage, /marketingConsent|leadReceipt|jobToken|recipientEmail/);
  // Spreads persist thumbnails only — never the original photo or File.
  const spreadKeys = Object.keys(workshopSnapshotSchema.shape.spreads.element.shape);
  assert.equal(spreadKeys.includes("preview"), false);
  assert.equal(spreadKeys.includes("file"), false);
  assert.ok(spreadKeys.includes("thumbnail"));
});

test("the translator hydrates before saving, skips mock mode, and clears on delivery", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  // Restore runs once into a pristine session and never from mock mode.
  assert.match(page, /const snapshot = readWorkshopSnapshot\(\);\s*\n\s*if \(!snapshot \|\| mockCookie\) return;/);
  assert.match(page, /hydrated\.current = true;/);
  // Saving waits for hydration and is disabled in mock mode.
  assert.match(page, /if \(!hydrated\.current \|\| mockMode\) return;/);
  // A restored delivery screen requires the resumable job token; otherwise the
  // parent lands on the gate to re-enter their email (which is never saved).
  assert.match(page, /const normalizedStep = normalizeRestoredStep\(snapshot\);/);
  assert.match(page, /normalizedStep === 11 && jobToken/);
  assert.match(page, /setStep\(Math\.min\(normalizedStep, 10\)\)/);
  // A finished delivery clears the saved workshop.
  assert.match(page, /sessionStorage\.removeItem\("bibaling_delivery_job"\);\s*\n\s*clearWorkshopSnapshot\(\);/);
  // Photos restored from a snapshot cannot be re-read: they become
  // replaceable error pages rather than silently re-reading thumbnails.
  assert.match(page, /Replace it to read the text again\./);
  // Thumbnails are produced when photos are added, not at save time.
  assert.match(page, /thumbnail: await thumbnailFromDataUrl\(preview\)/);
});

test("a refresh during refrain generation restores to the creative-freedom step", () => {
  // Step 6 was interrupted before any direction options arrived.
  const interrupted = snapshot({
    step: 6,
    directions: [],
    lockedDirection: null,
    selectedDirection: null
  });
  assert.equal(normalizeRestoredStep(interrupted), 5);
});

test("a refresh during Page 1 generation restores to the previous stable step", () => {
  const refrainBook = snapshot({ step: 7, spread1Options: [], spread1Selection: null });
  assert.equal(normalizeRestoredStep(refrainBook), 6);
  const proseBook = snapshot({
    step: 7,
    spread1Options: [],
    spread1Selection: null,
    bookForm: "prose_story",
    recommendedBookForm: "prose_story",
    sourceRhyme: "none",
    lockedDirection: null,
    directions: [],
    selectedDirection: null,
    shownRefrains: []
  });
  assert.equal(normalizeRestoredStep(proseBook), 5);
});

test("a refresh during pattern generation restores to the Page 1 workshop", () => {
  const interrupted = snapshot({
    step: 8,
    patternOptions: {
      "2": [{
        strategy: "Direct",
        text: "Druga stran.",
        modelLabel: "Sol · quality-first",
        originalText: "Druga stran.",
        editNote: ""
      }],
      "3": []
    },
    approvedDrafts: { "1": "Prva stran." }
  });
  assert.equal(normalizeRestoredStep(interrupted), 7);
});

test("a refresh during the Page 4 teaser keeps the gate step and restores the teaser at rest", () => {
  const restored = parseWorkshopSnapshot(JSON.stringify(snapshot({
    step: 10,
    teaser: { status: "writing", page: null }
  })));
  assert.ok(restored);
  assert.deepEqual(restored?.teaser, { status: "idle", page: null });
  assert.equal(normalizeRestoredStep(restored!), 10);
});

test("later steps without approved workshop pages fall back to the latest supported step", () => {
  const patternOption = {
    strategy: "Direct",
    text: "Stran v istem glasu.",
    modelLabel: "Sol · quality-first",
    originalText: "Stran v istem glasu.",
    editNote: ""
  };
  const noApprovals = snapshot({
    step: 9,
    approvedDrafts: {},
    patternOptions: { "2": [patternOption], "3": [patternOption] }
  });
  assert.equal(normalizeRestoredStep(noApprovals), 8);
  const noApprovalsOrPattern = snapshot({ step: 10, approvedDrafts: {}, patternOptions: { "2": [], "3": [] } });
  assert.equal(normalizeRestoredStep(noApprovalsOrPattern), 7);
  // Fully consistent snapshots keep their step.
  assert.equal(normalizeRestoredStep(snapshot({ step: 9 })), 9);
  assert.equal(normalizeRestoredStep(snapshot({ step: 4 })), 4);
});

test("Start over clears the saved workshop, the delivery token, and every in-flight request", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const startOver = page.slice(page.indexOf("function startOver"), page.indexOf("function toggleMockMode"));
  // Explicit, confirmed, and complete: persisted state, resumable delivery
  // token, in-flight requests, and a return to Step 1.
  assert.match(startOver, /window\.confirm/);
  assert.match(startOver, /clearWorkshopSnapshot\(\);/);
  assert.match(startOver, /sessionStorage\.removeItem\("bibaling_delivery_job"\);/);
  assert.match(startOver, /\[directionsAbort, translationAbort, teaserAbort, classifierAbort\]/);
  assert.match(startOver, /controller\.current\?\.abort\(\);/);
  assert.match(startOver, /setStep\(1\);/);
  assert.match(startOver, /setDeliveryJob\(\{ token: "", status: "idle", error: null \}\);/);
  assert.match(page, /onClick=\{startOver\}/);
});
