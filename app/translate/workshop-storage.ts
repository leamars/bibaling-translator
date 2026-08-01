import { z } from "zod";
import { BOOK_FORMS, SOURCE_RHYME } from "../api/book-form-contract.ts";
import { targetLanguageSchema } from "../languages/language-config.ts";

// ---------------------------------------------------------------------------
// Workshop persistence: the parent's work survives a refresh or an accidental
// tab close. Only text state and small preview thumbnails are stored —
// full-resolution photos are not persisted (they are only needed at
// transcription time), and neither is anything personal: no email address,
// no consent choices, no delivery tokens, and nothing from mock mode.
// ---------------------------------------------------------------------------

export const WORKSHOP_SNAPSHOT_KEY = "bibaling_workshop_v1";
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const optionSchema = z.object({
  strategy: z.string(),
  text: z.string(),
  modelLabel: z.string(),
  originalText: z.string(),
  editNote: z.string()
});

const directionSchema = z.object({
  name: z.string(),
  refrain: z.string(),
  approach: z.string(),
  genderDependency: z.string(),
  modelLabel: z.string()
});

const savedSpreadSchema = z.object({
  id: z.string(),
  // A downscaled JPEG thumbnail; may be empty when thumbnailing failed or
  // was dropped to fit the storage quota.
  thumbnail: z.string(),
  text: z.string(),
  uncertainty: z.string().nullable(),
  visualContext: z.string(),
  error: z.string().nullable(),
  status: z.enum(["waiting", "reading", "done", "error"])
});

export const workshopSnapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  savedAt: z.number().int().positive(),
  step: z.number().int().min(1).max(11),
  targetLanguage: targetLanguageSchema,
  regionalVariant: z.string().optional(),
  languageConfirmed: z.boolean(),
  priority: z.string(),
  freedom: z.string(),
  bookForm: z.enum(BOOK_FORMS).nullable(),
  recommendedBookForm: z.enum(BOOK_FORMS).nullable(),
  bookFormConfirmed: z.boolean(),
  bookFormExplanation: z.string(),
  sourceRhyme: z.enum(SOURCE_RHYME),
  spreads: z.array(savedSpreadSchema).max(40),
  directions: z.array(directionSchema),
  selectedDirection: z.number().nullable(),
  shownRefrains: z.array(z.string()),
  lockedDirection: directionSchema.nullable(),
  spread1Options: z.array(optionSchema),
  spread1Selection: z.number().nullable(),
  approvedSpread1: z.string(),
  patternOptions: z.record(z.string(), z.array(optionSchema)),
  patternSelections: z.record(z.string(), z.number().nullable()),
  approvedDrafts: z.record(z.string(), z.string()),
  approvedNotes: z.record(z.string(), z.string()),
  teaser: z.object({
    status: z.enum(["idle", "writing", "ready", "unavailable", "skipped"]),
    page: z.object({ page: z.number(), text: z.string() }).nullable()
  })
});

export type WorkshopSnapshot = z.infer<typeof workshopSnapshotSchema>;

/** Pure parse: returns null for anything malformed, stale, or versioned differently. */
export function parseWorkshopSnapshot(raw: string | null): WorkshopSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = workshopSnapshotSchema.parse(JSON.parse(raw));
    if (Date.now() - parsed.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
    // A snapshot mid-generation is restored at rest: the request it was
    // waiting on died with the page.
    if (parsed.teaser.status === "writing") {
      return { ...parsed, teaser: { status: "idle", page: null } };
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * A refresh can interrupt a model-generation step, leaving a snapshot whose
 * step points past its saved results. Restore never restarts model calls;
 * instead it lands on the furthest internally consistent completed step and
 * lets the parent trigger the next generation themselves:
 *
 * - step 6 without direction options → step 5;
 * - step 7 without Page 1 options → step 6 (refrain books) or 5;
 * - step 8 without options for both Pages 2 and 3 → step 7;
 * - step 9+ without approved Pages 1–3 → the latest supported step;
 * - step 11's delivery-token requirement stays with the caller, which can
 *   see sessionStorage.
 */
export function normalizeRestoredStep(snapshot: WorkshopSnapshot): number {
  const hasDirections = snapshot.directions.length > 0;
  const hasPage1Options = snapshot.spread1Options.length > 0;
  const hasPatternOptions = ["2", "3"].every(
    (key) => (snapshot.patternOptions[key]?.length ?? 0) > 0
  );
  const hasApprovedPages = ["1", "2", "3"].every(
    (key) => Boolean(snapshot.approvedDrafts[key]?.trim())
  );
  let step = Math.min(snapshot.step, 11);
  while (true) {
    if (step >= 9 && !hasApprovedPages) { step = 8; continue; }
    if (step === 8 && !hasPatternOptions) { step = 7; continue; }
    if (step === 7 && !hasPage1Options) {
      step = snapshot.bookForm === "refrain_verse" ? 6 : 5;
      continue;
    }
    if (step === 6 && (snapshot.bookForm !== "refrain_verse" || !hasDirections)) {
      step = 5;
      continue;
    }
    return step;
  }
}

export function readWorkshopSnapshot(): WorkshopSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return parseWorkshopSnapshot(window.localStorage.getItem(WORKSHOP_SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

export function writeWorkshopSnapshot(snapshot: WorkshopSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSHOP_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded: retry once without thumbnails — the parent's words
    // matter more than the preview images.
    try {
      window.localStorage.setItem(WORKSHOP_SNAPSHOT_KEY, JSON.stringify({
        ...snapshot,
        spreads: snapshot.spreads.map((spread) => ({ ...spread, thumbnail: "" }))
      }));
    } catch {
      // Persistence is best-effort; never let it break the workshop.
    }
  }
}

export function clearWorkshopSnapshot() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WORKSHOP_SNAPSHOT_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * Downscale an image data-URL to a small JPEG thumbnail for persistence.
 * Returns "" when thumbnailing is unavailable or fails.
 */
export async function thumbnailFromDataUrl(dataUrl: string, maxEdge = 320): Promise<string> {
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image/")) return "";
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image failed to decode."));
      element.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return "";
  }
}
