"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent, trackFunnelEventOnce } from "../analytics";
import {
  BOOK_FORM_OPTIONS,
  bookFormLabel,
  nextAfterFreedom,
  page1BackStep,
  workshopProgress,
  type BookForm,
  type BookFormAnalysis,
  type SourceRhyme
} from "../api/book-form-contract.ts";
import {
  languageConfig,
  languageSelectorGroups,
  resolveLanguageSelection,
  selectorValueFor,
  type TargetLanguage
} from "../languages/language-config.ts";
import {
  SNAPSHOT_VERSION,
  clearWorkshopSnapshot,
  normalizeRestoredStep,
  readWorkshopSnapshot,
  thumbnailFromDataUrl,
  writeWorkshopSnapshot,
  type WorkshopSnapshot
} from "./workshop-storage.ts";

type Spread = {
  id: string;
  // Absent on spreads restored from a saved workshop: the original photo is
  // only needed at transcription time and is never persisted.
  file?: File;
  preview: string;
  // Small persisted preview; empty when thumbnailing failed or was dropped.
  thumbnail: string;
  text: string;
  uncertainty: string | null;
  visualContext: string;
  error: string | null;
  status: "waiting" | "reading" | "done" | "error";
  // The first three uploads are voice samples. Their approved translations
  // stay attached to the photos when the complete book is reordered later.
  voiceSample?: boolean;
  sampleNumber?: number;
  approvedText?: string | null;
  parentNote?: string;
};

type Direction = {
  name: string;
  refrain: string;
  approach: string;
  genderDependency: string;
  modelLabel: string;
};

type GeneratedOption = { strategy: string; text: string };
type TranslationOption = GeneratedOption & {
  modelLabel: string;
  originalText: string;
  editNote: string;
};
type RequestState = { loading: boolean; error: string | null; errorCode?: string | null };
type DirectionProgress = { active: number; completedThrough: number; rejectedCount: number };
type DirectionStreamResult = {
  runs: Array<{ label: string; directions: Omit<Direction, "modelLabel">[] }>;
};

const INITIAL_SAMPLE_LIMIT = 3;
const MAX_BOOK_PAGES = 40;

const priorities = [
  ["rhythm", "Rhyme and read-aloud rhythm", "Make it musical and satisfying to say."],
  ["meaning", "Meaning and picture details", "Keep the joke, emotional beat, and what the child sees."],
  ["simple", "Simple language", "Use words that are easy for a young child to follow."]
] as const;

function prioritiesFor(bookForm: BookForm | null) {
  if (bookForm === "prose_story") {
    return [
      ["rhythm", "A natural read-aloud voice", "Make the storytelling warm, fluent, and satisfying to say."],
      priorities[1],
      priorities[2]
    ] as const;
  }
  if (bookForm === "continuous_verse") {
    return [
      ["rhythm", "Poetic rhythm and read-aloud flow", "Preserve the poem’s movement without inventing a refrain."],
      priorities[1],
      priorities[2]
    ] as const;
  }
  return priorities;
}

function freedomsFor(targetLanguage: TargetLanguage) {
  const language = languageConfig(targetLanguage).name;
  return [
    ["close", "Stay close", "Preserve each page’s meaning; change only what’s necessary."],
    ["natural", `Sound naturally ${language}`, "Keep the story and pictures, but freely repair awkward lines, jokes, and rhymes."],
    ["playful", "Reimagine playfully", `Keep the events and feeling, while creating new ${language} wordplay.`]
  ] as const;
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result as T;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function compactGeneratedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\n+/g, "\n")
    .trim();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function mockPreview(number: number) {
  const colors = ["#dcebe4", "#f2dfb7", "#d9e4f2", "#ead8d1", "#dce4bd", "#e4d8ef"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${colors[(number - 1) % colors.length]}"/><circle cx="400" cy="260" r="120" fill="#fff" opacity=".75"/><text x="400" y="285" text-anchor="middle" font-family="Georgia" font-size="54" fill="#245747">Mock page ${number}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function Translator() {
  const [step, setStep] = useState(1);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("sl");
  const [regionalVariant, setRegionalVariant] = useState<string | undefined>();
  const [languageFeedback, setLanguageFeedback] = useState("");
  const [languageFeedbackSaved, setLanguageFeedbackSaved] = useState(false);
  const [languageConfirmed, setLanguageConfirmed] = useState(false);
  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [priority, setPriority] = useState("");
  const [freedom, setFreedom] = useState("");
  const [bookForm, setBookForm] = useState<BookForm | null>(null);
  const [recommendedBookForm, setRecommendedBookForm] = useState<BookForm | null>(null);
  const [bookFormConfirmed, setBookFormConfirmed] = useState(false);
  const [bookFormExplanation, setBookFormExplanation] = useState("");
  const [sourceRhyme, setSourceRhyme] = useState<SourceRhyme>("uncertain");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<number | null>(null);
  const [editingDirection, setEditingDirection] = useState<number | null>(null);
  const [directionFeedback, setDirectionFeedback] = useState("");
  const [customRefrain, setCustomRefrain] = useState("");
  const [shownRefrains, setShownRefrains] = useState<string[]>([]);
  const [lockedDirection, setLockedDirection] = useState<Direction | null>(null);
  const [spread1Options, setSpread1Options] = useState<TranslationOption[]>([]);
  const [spread1Selection, setSpread1Selection] = useState<number | null>(null);
  const [approvedSpread1, setApprovedSpread1] = useState("");
  const [patternOptions, setPatternOptions] = useState<Record<number, TranslationOption[]>>({});
  const [patternSelections, setPatternSelections] = useState<Record<number, number | null>>({ 2: null, 3: null });
  const [approvedDrafts, setApprovedDrafts] = useState<Record<number, string>>({});
  const [approvedNotes, setApprovedNotes] = useState<Record<number, string>>({});
  const [request, setRequest] = useState<RequestState>({ loading: false, error: null });
  const [directionProgress, setDirectionProgress] = useState<DirectionProgress>({ active: 0, completedThrough: -1, rejectedCount: 0 });
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  // Page 4 is the last complete preview. Page 5 begins loading before the
  // email gate interrupts it, so the workshop still feels page-by-page.
  const [teaser, setTeaser] = useState<{
    status: "idle" | "reading" | "writing" | "ready" | "unavailable" | "skipped";
    page: { page: number; text: string } | null;
  }>({ status: "idle", page: null });
  const [emailGateVisible, setEmailGateVisible] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [leadReceipt, setLeadReceipt] = useState("");
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsentChoice] = useState(false);
  const [emailRequest, setEmailRequest] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [deliveryJob, setDeliveryJob] = useState<{
    token: string;
    status: "idle" | "processing" | "completed" | "failed";
    error: string | null;
  }>({ token: "", status: "idle", error: null });
  const directionsAbort = useRef<AbortController | null>(null);
  const translationAbort = useRef<AbortController | null>(null);
  const teaserAbort = useRef<AbortController | null>(null);
  const spreadReadTasks = useRef<Map<string, Promise<void>>>(new Map());
  const spreadsRef = useRef<Spread[]>([]);
  const hydrated = useRef(false);
  const classifierAbort = useRef<AbortController | null>(null);
  const language = useMemo(
    () => resolveLanguageSelection(targetLanguage, regionalVariant),
    [targetLanguage, regionalVariant]
  );
  const sampleSpreads = useMemo(
    () => spreads
      .filter((spread) => spread.voiceSample)
      .sort((first, second) => (first.sampleNumber ?? 0) - (second.sampleNumber ?? 0))
      .slice(0, INITIAL_SAMPLE_LIMIT),
    [spreads]
  );
  const experimentalLanguage = language.config.status === "experimental";
  const deliveryRecipient = email.trim() || "the email address you entered";

  useEffect(() => {
    spreadsRef.current = spreads;
  }, [spreads]);

  const progressPosition = useMemo(() => workshopProgress(bookForm, step), [bookForm, step]);
  const progress = `${progressPosition.current} of ${progressPosition.total}`;

  useEffect(() => {
    setMockMode(document.cookie.split(";").some((part) => part.trim() === "bibaling_mock_mode=true"));
    trackFunnelEventOnce("translator_opened", { languagePair: "en-und" });
    const syncConsent = () => setAnalyticsConsentChoice(getAnalyticsConsent() === true);
    syncConsent();
    window.addEventListener("bibaling:analytics-consent", syncConsent);
    return () => window.removeEventListener("bibaling:analytics-consent", syncConsent);
  }, []);

  useEffect(() => {
    if (step !== 11 || teaser.status !== "ready") return;
    const timeout = window.setTimeout(() => setEmailGateVisible(true), 1_800);
    return () => window.clearTimeout(timeout);
  }, [step, teaser.status]);

  useEffect(() => {
    if (!emailGateVisible || !bookForm) return;
    trackFunnelEventOnce("email_gate_displayed", {
      bookForm,
      languagePair: language.languagePair,
      targetLanguage,
      regionalVariant
    });
  }, [bookForm, emailGateVisible, language.languagePair, regionalVariant, targetLanguage]);

  // Restore a saved workshop after a refresh or accidental tab close.
  // Runs once on mount, only into a pristine session, and never in mock mode.
  // Photos are not persisted: restored spreads carry their small thumbnails,
  // which is all the later steps need — transcription already happened.
  useEffect(() => {
    const restore = () => {
      const mockCookie = document.cookie.split(";").some((part) => part.trim() === "bibaling_mock_mode=true");
      const snapshot = readWorkshopSnapshot();
      if (!snapshot || mockCookie) return;
      setTargetLanguage(snapshot.targetLanguage);
      setRegionalVariant(snapshot.regionalVariant);
      setLanguageConfirmed(snapshot.languageConfirmed);
      setPriority(snapshot.priority);
      setFreedom(snapshot.freedom);
      setBookForm(snapshot.bookForm);
      setRecommendedBookForm(snapshot.recommendedBookForm);
      setBookFormConfirmed(snapshot.bookFormConfirmed);
      setBookFormExplanation(snapshot.bookFormExplanation);
      setSourceRhyme(snapshot.sourceRhyme);
      const hasSavedVoiceSamples = snapshot.spreads.some((spread) => spread.voiceSample);
      setSpreads(snapshot.spreads.map((spread, index) => {
        const inferredVoiceSample = !hasSavedVoiceSamples && index < INITIAL_SAMPLE_LIMIT;
        const voiceSample = Boolean(spread.voiceSample || inferredVoiceSample);
        const sampleNumber = spread.sampleNumber ?? (voiceSample ? index + 1 : undefined);
        return {
          id: spread.id,
          preview: spread.thumbnail,
          thumbnail: spread.thumbnail,
          text: spread.text,
          uncertainty: spread.uncertainty,
          visualContext: spread.visualContext,
          // A page killed mid-read has no full-resolution photo anymore; ask
          // for a replacement instead of re-reading the thumbnail.
          error: spread.status === "done" ? spread.error : spread.status === "error" ? spread.error : "We lost this photo when the page closed. Replace it to read the text again.",
          status: spread.status === "done" || spread.status === "error" ? spread.status : "error",
          voiceSample,
          sampleNumber,
          approvedText: spread.approvedText ?? (sampleNumber ? snapshot.approvedDrafts[String(sampleNumber)] ?? null : null),
          parentNote: spread.parentNote ?? (sampleNumber ? snapshot.approvedNotes[String(sampleNumber)] : undefined)
        };
      }));
      setDirections(snapshot.directions);
      setSelectedDirection(snapshot.selectedDirection);
      setShownRefrains(snapshot.shownRefrains);
      setLockedDirection(snapshot.lockedDirection);
      setSpread1Options(snapshot.spread1Options);
      setSpread1Selection(snapshot.spread1Selection);
      setApprovedSpread1(snapshot.approvedSpread1);
      setPatternOptions(snapshot.patternOptions as Record<number, TranslationOption[]>);
      setPatternSelections({ 2: null, 3: null, ...(snapshot.patternSelections as Record<number, number | null>) });
      setApprovedDrafts(snapshot.approvedDrafts as Record<number, string>);
      setApprovedNotes(snapshot.approvedNotes as Record<number, string>);
      setTeaser(snapshot.teaser);
      // A refresh mid-generation restores to the furthest completed step —
      // model calls are never restarted automatically.
      const normalizedStep = normalizeRestoredStep(snapshot);
      // The delivery screen only makes sense with a resumable job token; the
      // email itself is deliberately never persisted, so otherwise land on
      // the gate and let the parent re-enter it.
      const jobToken = sessionStorage.getItem("bibaling_delivery_job");
      if (normalizedStep === 12 && jobToken) {
        setDeliveryJob({ token: jobToken, status: "processing", error: null });
        setStep(12);
      } else {
        setStep(Math.min(normalizedStep, 11));
      }
    };
    restore();
    hydrated.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save the workshop as the parent works. Text only plus thumbnails — never
  // the email address, consent choices, or anything from mock mode.
  useEffect(() => {
    if (!hydrated.current || mockMode) return;
    if (step === 1 && spreads.length === 0) return;
    const timeout = window.setTimeout(() => {
      const snapshot: WorkshopSnapshot = {
        version: SNAPSHOT_VERSION,
        savedAt: Date.now(),
        step,
        targetLanguage,
        regionalVariant,
        languageConfirmed,
        priority,
        freedom,
        bookForm,
        recommendedBookForm,
        bookFormConfirmed,
        bookFormExplanation,
        sourceRhyme,
        spreads: spreads.map((spread) => ({
          id: spread.id,
          thumbnail: spread.thumbnail,
          text: spread.text,
          uncertainty: spread.uncertainty,
          visualContext: spread.visualContext,
          error: spread.error,
          status: spread.status,
          voiceSample: spread.voiceSample,
          sampleNumber: spread.sampleNumber,
          approvedText: spread.approvedText,
          parentNote: spread.parentNote
        })),
        directions,
        selectedDirection,
        shownRefrains,
        lockedDirection,
        spread1Options,
        spread1Selection,
        approvedSpread1,
        patternOptions,
        patternSelections,
        approvedDrafts,
        approvedNotes,
        teaser
      };
      writeWorkshopSnapshot(snapshot);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [
    approvedDrafts, approvedNotes, approvedSpread1, bookForm, bookFormConfirmed,
    bookFormExplanation, directions, freedom, languageConfirmed, lockedDirection,
    mockMode, patternOptions, patternSelections, priority, recommendedBookForm,
    regionalVariant, selectedDirection, shownRefrains, sourceRhyme, spread1Options,
    spread1Selection, spreads, step, targetLanguage, teaser
  ]);

  useEffect(() => {
    if (!expandedImage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedImage(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expandedImage]);

  useEffect(() => {
    if (!deliveryJob.token || deliveryJob.status !== "processing") return;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/delivery/status?token=${encodeURIComponent(deliveryJob.token)}`);
        const result = await response.json() as { status?: string; error?: string };
        if (!response.ok) throw new Error(result.error || "We couldn’t check the delivery yet.");
        if (stopped) return;
        if (result.status === "completed") {
          setDeliveryJob((current) => ({ ...current, status: "completed", error: null }));
          sessionStorage.removeItem("bibaling_delivery_job");
          clearWorkshopSnapshot();
          trackFunnelEventOnce("delivery_succeeded", { bookForm: bookForm ?? undefined, languagePair: language.languagePair, targetLanguage, regionalVariant });
        } else if (result.status === "failed" || result.status === "cancelled") {
          setDeliveryJob((current) => ({
            ...current,
            status: "failed",
            error: "We couldn’t finish and send your translation. Please try again."
          }));
          trackFunnelEventOnce("delivery_failed", { bookForm: bookForm ?? undefined, languagePair: language.languagePair, targetLanguage, regionalVariant });
        }
      } catch {
        // A temporary status-check failure must not change or cancel the durable workflow.
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 3_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [bookForm, deliveryJob.status, deliveryJob.token, language.languagePair, regionalVariant, targetLanguage]);

  useEffect(() => {
    if (step !== 6) return;
    const deselectOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(".direction-card") && !target.closest("nav")) {
        setSelectedDirection(null);
        setEditingDirection(null);
      }
    };
    document.addEventListener("pointerdown", deselectOutside);
    return () => document.removeEventListener("pointerdown", deselectOutside);
  }, [step]);

  // A real start-over: aborts anything in flight, clears the persisted
  // workshop and the resumable delivery token, and resets every piece of
  // workshop state to its initial value. The reset leaves the session
  // pristine, so the save effect writes nothing until new work begins.
  function startOver() {
    if (!window.confirm("Start over? This clears this book’s saved work on this device.")) return;
    for (const controller of [directionsAbort, translationAbort, teaserAbort, classifierAbort]) {
      controller.current?.abort();
      controller.current = null;
    }
    clearWorkshopSnapshot();
    sessionStorage.removeItem("bibaling_delivery_job");
    setStep(1);
    setTargetLanguage("sl");
    setRegionalVariant(undefined);
    setLanguageFeedback("");
    setLanguageFeedbackSaved(false);
    setLanguageConfirmed(false);
    setSpreads([]);
    setPriority("");
    setFreedom("");
    setBookForm(null);
    setRecommendedBookForm(null);
    setBookFormConfirmed(false);
    setBookFormExplanation("");
    setSourceRhyme("uncertain");
    setDirections([]);
    setSelectedDirection(null);
    setEditingDirection(null);
    setDirectionFeedback("");
    setCustomRefrain("");
    setShownRefrains([]);
    setLockedDirection(null);
    setSpread1Options([]);
    setSpread1Selection(null);
    setApprovedSpread1("");
    setPatternOptions({});
    setPatternSelections({ 2: null, 3: null });
    setApprovedDrafts({});
    setApprovedNotes({});
    setRequest({ loading: false, error: null });
    setDirectionProgress({ active: 0, completedThrough: -1, rejectedCount: 0 });
    setDraggedPage(null);
    setExpandedImage(null);
    setTeaser({ status: "idle", page: null });
    setEmailGateVisible(false);
    setEmailCaptured(false);
    setLeadReceipt("");
    setEmail("");
    setMarketingConsent(false);
    setEmailRequest({ loading: false, error: null });
    setDeliveryJob({ token: "", status: "idle", error: null });
  }

  function toggleMockMode() {
    setMockMode((current) => {
      const next = !current;
      document.cookie = `bibaling_mock_mode=${next}; path=/; SameSite=Lax`;
      if (next && spreads.length === 0) window.setTimeout(loadMockBook, 0);
      return next;
    });
  }

  function loadMockBook() {
    const sources = [
      "A small friend watches over me. I love you all.",
      "These friends hold hands and spin around. I love you all.",
      "My bright friend makes the whole forest glow. I love you all."
    ];
    setSpreads(sources.map((text, index) => ({
      id: crypto.randomUUID(),
      file: new File(["mock"], `mock-page-${index + 1}.png`, { type: "image/png" }),
      preview: mockPreview(index + 1),
      thumbnail: "",
      text,
      uncertainty: null,
      visualContext: "A mock picture-book page.",
      error: null,
      status: "done" as const,
      voiceSample: true,
      sampleNumber: index + 1,
      approvedText: null
    })));
  }

  async function analyzeBookForm() {
    classifierAbort.current?.abort();
    const controller = new AbortController();
    classifierAbort.current = controller;
    setStep(3);
    setBookFormConfirmed(false);
    setRequest({ loading: true, error: null });
    try {
      const result = await postJson<BookFormAnalysis>("/api/book-form", {
        texts: sampleSpreads.map((spread) => spread.text),
        visualContexts: sampleSpreads.map((spread) => spread.visualContext),
        targetLanguage,
        regionalVariant
      }, controller.signal);
      setBookForm(result.bookForm);
      setRecommendedBookForm(result.bookForm);
      setBookFormConfirmed(true);
      setBookFormExplanation(result.explanation);
      setSourceRhyme(result.sourceRhyme);
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setRecommendedBookForm(null);
        setBookFormExplanation("");
        setRequest({
          loading: false,
          error: error instanceof Error ? error.message : "We couldn’t recommend a book form. Choose one below."
        });
      }
    } finally {
      if (classifierAbort.current === controller) classifierAbort.current = null;
    }
  }

  function backFromBookForm() {
    classifierAbort.current?.abort();
    classifierAbort.current = null;
    setRequest({ loading: false, error: null });
    setStep(2);
  }

  async function readSpread(id: string, image: string) {
    setSpreads((current) => {
      const next = current.map((spread) =>
        spread.id === id ? { ...spread, error: null, status: "reading" as const } : spread
      );
      spreadsRef.current = next;
      return next;
    });
    try {
      let result: { text: string; uncertainty: string | null; visualContext: string } | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          result = await postJson<{ text: string; uncertainty: string | null; visualContext: string }>("/api/transcribe", { image });
          break;
        } catch (error) {
          const connectionDropped = error instanceof TypeError && error.message === "Failed to fetch";
          if (!connectionDropped || attempt === 1) throw error;
          await wait(2200);
        }
      }
      if (!result) throw new Error("We couldn’t read this page.");
      setSpreads((current) => {
        const next = current.map((spread) =>
          spread.id === id
            ? { ...spread, text: compactGeneratedText(result.text), uncertainty: result.uncertainty, visualContext: result.visualContext, error: null, status: "done" as const }
            : spread
        );
        spreadsRef.current = next;
        return next;
      });
    } catch (error) {
      setSpreads((current) => {
        const next = current.map((spread) =>
          spread.id === id
            ? { ...spread, error: error instanceof Error ? error.message : "We couldn’t read this page.", status: "error" as const }
            : spread
        );
        spreadsRef.current = next;
        return next;
      });
    }
  }

  function prefetchSpreadText(id: string, image: string) {
    const active = spreadReadTasks.current.get(id);
    if (active) return active;
    const task = readSpread(id, image);
    spreadReadTasks.current.set(id, task);
    void task.finally(() => {
      if (spreadReadTasks.current.get(id) === task) spreadReadTasks.current.delete(id);
    });
    return task;
  }

  async function addFile(file?: File, replaceId?: string) {
    if (!file || !file.type.startsWith("image/") || (!replaceId && spreads.length >= MAX_BOOK_PAGES)) return;
    const preview = await fileToDataUrl(file);
    const thumbnail = await thumbnailFromDataUrl(preview);
    const id = replaceId ?? crypto.randomUUID();
    const nextSpread: Spread = {
      id, file, preview, thumbnail, text: "", uncertainty: null, visualContext: "", error: null, status: "waiting"
    };
    setSpreads((current) => replaceId
      ? current.map((spread) => spread.id === replaceId ? {
          ...nextSpread,
          voiceSample: spread.voiceSample,
          sampleNumber: spread.sampleNumber,
          approvedText: spread.approvedText,
          parentNote: spread.parentNote
        } : spread)
      : [...current, nextSpread]
    );
    void prefetchSpreadText(id, preview);
  }

  async function addFiles(files?: FileList | File[], maximumPages = INITIAL_SAMPLE_LIMIT, voiceSample = true) {
    if (!files) return;
    const available = Math.max(0, maximumPages - spreads.length);
    const images = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, available);
    if (images.length === 0) return;

    const existingSampleCount = spreads.filter((spread) => spread.voiceSample).length;
    const additions = await Promise.all(images.map(async (file, index) => {
      const preview = await fileToDataUrl(file);
      return {
      id: crypto.randomUUID(),
      file,
      preview,
      thumbnail: await thumbnailFromDataUrl(preview),
      text: "",
      uncertainty: null,
      visualContext: "",
      error: null,
      status: "waiting" as const,
      voiceSample,
      sampleNumber: voiceSample ? existingSampleCount + index + 1 : undefined,
      approvedText: null
      };
    }));
    setSpreads((current) => [...current, ...additions].slice(0, maximumPages));
    additions.forEach((spread) => void prefetchSpreadText(spread.id, spread.preview));
  }

  function chooseFile(
    event: ChangeEvent<HTMLInputElement>,
    replaceId?: string,
    maximumPages = INITIAL_SAMPLE_LIMIT,
    voiceSample = true
  ) {
    if (replaceId) void addFile(event.target.files?.[0], replaceId);
    else void addFiles(event.target.files ?? undefined, maximumPages, voiceSample);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLLabelElement>, maximumPages = INITIAL_SAMPLE_LIMIT, voiceSample = true) {
    event.preventDefault();
    void addFiles(event.dataTransfer.files, maximumPages, voiceSample);
  }

  function startRestOfBook() {
    setSpreads((current) => {
      const markedSamples = current.map((spread) => {
        if (!spread.voiceSample || !spread.sampleNumber) return spread;
        return {
          ...spread,
          approvedText: approvedDrafts[spread.sampleNumber] ?? null,
          parentNote: approvedNotes[spread.sampleNumber] ?? undefined
        };
      });
      if (!mockMode || markedSamples.length > INITIAL_SAMPLE_LIMIT) return markedSamples;
      const mockRemainder = [4, 5, 6].map((number) => ({
        id: crypto.randomUUID(),
        file: new File(["mock"], `mock-page-${number}.png`, { type: "image/png" }),
        preview: mockPreview(number),
        thumbnail: "",
        text: `Mock English source for page ${number}. The friends continue their adventure.`,
        uncertainty: null,
        visualContext: "A mock picture-book page continuing the friends’ adventure.",
        error: null,
        status: "done" as const,
        voiceSample: false,
        sampleNumber: undefined,
        approvedText: null
      }));
      return [...markedSamples, ...mockRemainder];
    });
    setStep(10);
  }

  function moveBookPage(fromId: string, toId: string) {
    if (fromId === toId) return;
    setSpreads((current) => {
      const from = current.findIndex((spread) => spread.id === fromId);
      const to = current.findIndex((spread) => spread.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function generateDirections(freshDraft = false) {
    if (directionsAbort.current) return;
    const controller = new AbortController();
    directionsAbort.current = controller;
    setStep(6);
    setRequest({ loading: true, error: null });
    setDirectionProgress({ active: 0, completedThrough: -1, rejectedCount: 0 });
    let failureCode: string | null = null;
    try {
      const response = await fetch("/api/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        signal: controller.signal,
        body: JSON.stringify({
          visualContexts: sampleSpreads.map((spread) => spread.visualContext),
          texts: sampleSpreads.map((spread) => spread.text),
          priority,
          freedom,
          parentFeedback: directionFeedback.trim() || undefined,
          previousRefrains: shownRefrains,
          freshDraft,
          targetLanguage,
          regionalVariant
        })
      });
      if (!response.ok || !response.body) throw new Error("We couldn’t start the literary workshop.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: DirectionStreamResult | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const block of events) {
          const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(6)) as {
            type: string;
            event?: string;
            rejectedCount?: number;
            code?: string;
            retryMode?: "editor_only" | "full";
            error?: string;
            data?: DirectionStreamResult;
          };
          if (event.type === "error") {
            failureCode = event.code || null;
            throw new Error(event.error);
          }
          if (event.type === "cancelled") throw new DOMException(event.error || "Cancelled", "AbortError");
          if (event.type === "result") result = event.data || null;
          if (event.type === "progress") {
            if (event.event === "drafting_started") {
              setDirectionProgress((current) => ({ ...current, active: 2, completedThrough: 1 }));
            } else if (event.event === "drafting_completed") {
              setDirectionProgress((current) => ({ ...current, active: 3, completedThrough: 2 }));
            } else if (event.event === "validating_candidates") {
              setDirectionProgress((current) => ({ ...current, active: 4, completedThrough: 3 }));
            } else if (event.event === "editing_started") {
              setDirectionProgress((current) => ({ ...current, active: 5, completedThrough: 4 }));
            } else if (event.event === "editing_completed") {
              setDirectionProgress((current) => ({ ...current, active: 6, completedThrough: 5 }));
            } else if (event.event === "completed") {
              setDirectionProgress((current) => ({ ...current, active: 6, completedThrough: 6 }));
            }
          }
        }
      }
      if (!result) throw new Error("We couldn’t finish those literary options. Your choices and edits are still here—please try again.");
      setDirections(result.runs.flatMap((run) =>
        run.directions.map((direction) => ({ ...direction, modelLabel: run.label }))
      ));
      setShownRefrains((current) => Array.from(new Set([
        ...current,
        ...result.runs.flatMap((run) => run.directions.map((direction) => direction.refrain.trim()))
      ])));
      setSelectedDirection(null);
      setLockedDirection(null);
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (directionsAbort.current === controller) setRequest({ loading: false, error: null });
      } else {
        setRequest({
          loading: false,
          error: error instanceof Error ? error.message : "We couldn’t write the directions.",
          errorCode: failureCode
        });
      }
    } finally {
      if (directionsAbort.current === controller) directionsAbort.current = null;
    }
  }

  function cancelDirections(goBack = false) {
    directionsAbort.current?.abort();
    directionsAbort.current = null;
    setRequest({ loading: false, error: null });
    if (goBack) setStep(5);
  }

  function restartDirections() {
    directionsAbort.current?.abort();
    directionsAbort.current = null;
    setRequest({ loading: false, error: null });
    window.setTimeout(() => void generateDirections(), 0);
  }

  function updateDirection(index: number, key: keyof Direction, value: string) {
    setDirections((current) => current.map((direction, i) => i === index ? { ...direction, [key]: value } : direction));
  }

  function addCustomDirection() {
    const refrain = customRefrain.trim();
    const base = directions[selectedDirection ?? 0];
    if (!refrain || !base) return;
    const custom = {
      ...base,
      name: "Parent’s refrain",
      refrain,
      modelLabel: "Parent"
    };
    setDirections((current) => [...current, custom]);
    setSelectedDirection(directions.length);
    setEditingDirection(null);
    setCustomRefrain("");
  }

  async function writeSpread1(direction?: Direction, previousOptions: string[] = []) {
    if (!bookForm || (bookForm === "refrain_verse" && !direction)) return;
    trackFunnelEventOnce("first_page_generation_started", { bookForm, languagePair: language.languagePair, targetLanguage, regionalVariant });
    const controller = new AbortController();
    translationAbort.current = controller;
    setLockedDirection(direction ?? null);
    setStep(7);
    setRequest({ loading: true, error: null });
    try {
      const result = await postJson<{ runs: Array<{ label: string; options: GeneratedOption[] }> }>("/api/translations", {
        mode: "spread1",
        visualContext: sampleSpreads[0].visualContext,
        source: sampleSpreads[0].text,
        priority,
        freedom,
        bookForm,
        sourceRhyme,
        targetLanguage,
        regionalVariant,
        ...(previousOptions.length > 0 ? { previousOptions } : {}),
        ...(direction ? { direction } : {})
      }, controller.signal);
      setSpread1Options(result.runs.flatMap((run) =>
        run.options.map((option) => ({
          ...option,
          text: compactGeneratedText(option.text),
          modelLabel: run.label,
          originalText: compactGeneratedText(option.text),
          editNote: ""
        }))
      ));
      trackFunnelEventOnce("first_page_translation_displayed", { bookForm, languagePair: language.languagePair, targetLanguage, regionalVariant });
      setSpread1Selection(null);
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setRequest({ loading: false, error: error instanceof Error ? error.message : "We couldn’t write Page 1." });
      }
    } finally {
      if (translationAbort.current === controller) translationAbort.current = null;
    }
  }

  async function lockDirectionAndWriteSpread1() {
    if (selectedDirection === null) return;
    await writeSpread1({ ...directions[selectedDirection] });
  }

  async function rerollSpread1() {
    const previousOptions = spread1Options.map((option) => option.text.trim()).filter(Boolean);
    if (previousOptions.length === 0) return;
    trackFunnelEventOnce("first_page_translation_rerolled", {
      bookForm: bookForm ?? undefined,
      languagePair: language.languagePair,
      targetLanguage,
      regionalVariant
    });
    await writeSpread1(lockedDirection ?? undefined, previousOptions);
  }

  function updateSpread1Option(index: number, text: string) {
    setSpread1Options((current) => current.map((option, i) => i === index ? { ...option, text } : option));
  }

  function updateSpread1Note(index: number, editNote: string) {
    setSpread1Options((current) => current.map((option, i) => i === index ? { ...option, editNote } : option));
  }

  function saveExperimentalLanguageFeedback() {
    const feedback = languageFeedback.trim();
    if (!feedback) return;
    const key = "bibaling_experimental_language_feedback";
    const previous = (() => {
      try { return JSON.parse(sessionStorage.getItem(key) || "[]") as unknown[]; } catch { return []; }
    })();
    sessionStorage.setItem(key, JSON.stringify([...previous, {
      targetLanguage,
      regionalVariant: regionalVariant || null,
      page: 1,
      feedback,
      createdAt: new Date().toISOString()
    }]));
    setLanguageFeedbackSaved(true);
  }

  async function approveSpread1AndPatternTest() {
    if (spread1Selection === null) return;
    const approved = spread1Options[spread1Selection].text.trim();
    if (!approved) return;
    await startPatternTest(approved, spread1Options[spread1Selection].editNote.trim());
  }

  // The workshop runs before email capture: pattern testing needs no lead
  // receipt. The email gate sits after the Page 4 teaser (step 10).
  async function startPatternTest(approved: string, approvedNote: string) {
    if (!bookForm || (bookForm === "refrain_verse" && !lockedDirection)) return;
    const controller = new AbortController();
    translationAbort.current = controller;
    setApprovedSpread1(approved);
    setApprovedNotes((current) => ({ ...current, 1: approvedNote }));
    setStep(8);
    setRequest({ loading: true, error: null });
    try {
      const result = await postJson<{ runs: Array<{ label: string; spreads: Array<{ spread: number; options: GeneratedOption[] }> }> }>("/api/translations", {
        mode: "pattern",
        visualContexts: [sampleSpreads[1].visualContext, sampleSpreads[2].visualContext],
        sources: [sampleSpreads[1].text, sampleSpreads[2].text],
        priority,
        freedom,
        bookForm,
        sourceRhyme,
        targetLanguage,
        regionalVariant,
        ...(lockedDirection ? { direction: lockedDirection } : {}),
        approvedSpread1: approved,
        approvedSpread1Note: approvedNote || undefined
      }, controller.signal);
      setPatternOptions(Object.fromEntries([2, 3].map((spreadNumber) => [
        spreadNumber,
        result.runs.flatMap((run) => {
          const spread = run.spreads.find((item) => item.spread === spreadNumber);
          return (spread?.options || []).map((option) => ({
            ...option,
            text: compactGeneratedText(option.text),
            modelLabel: run.label,
            originalText: compactGeneratedText(option.text),
            editNote: ""
          }));
        })
      ])));
      setPatternSelections({ 2: null, 3: null });
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setRequest({ loading: false, error: error instanceof Error ? error.message : "We couldn’t test the next pages." });
      }
    } finally {
      if (translationAbort.current === controller) translationAbort.current = null;
    }
  }

  function restartTranslation(action: () => Promise<void>) {
    translationAbort.current?.abort();
    translationAbort.current = null;
    setRequest({ loading: false, error: null });
    window.setTimeout(() => void action(), 0);
  }

  function updatePatternOption(spreadNumber: number, optionIndex: number, text: string) {
    setPatternOptions((current) => ({
      ...current,
      [spreadNumber]: current[spreadNumber].map((option, index) => index === optionIndex ? { ...option, text } : option)
    }));
  }

  function updatePatternNote(spreadNumber: number, optionIndex: number, editNote: string) {
    setPatternOptions((current) => ({
      ...current,
      [spreadNumber]: current[spreadNumber].map((option, index) =>
        index === optionIndex ? { ...option, editNote } : option
      )
    }));
  }

  function approvePattern() {
    if (patternSelections[2] === null || patternSelections[3] === null) return;
    setApprovedDrafts({
      1: approvedSpread1,
      2: patternOptions[2][patternSelections[2] as number].text.trim(),
      3: patternOptions[3][patternSelections[3] as number].text.trim()
    });
    setApprovedNotes((current) => ({
      ...current,
      2: patternOptions[2][patternSelections[2] as number].editNote.trim(),
      3: patternOptions[3][patternSelections[3] as number].editNote.trim()
    }));
    setStep(9);
  }

  // Page 4 is genuinely written and revealed in the locked voice. Once it is
  // complete, Page 5 visibly starts before the email gate takes its place.
  // A failed Page 4 preview must never block the funnel.
  async function startTeaser() {
    if (!bookForm || (bookForm === "refrain_verse" && !lockedDirection)) return;
    setStep(11);
    setEmailGateVisible(false);
    if (spreads.length <= 3) {
      setTeaser({ status: "skipped", page: null });
      setEmailGateVisible(true);
      return;
    }
    const approvedVoice = spreads.flatMap((spread, index) =>
      spread.voiceSample && spread.approvedText?.trim() ? [{
        spread: index + 1,
        text: spread.approvedText.trim(),
        ...(spread.parentNote ? { parentNote: spread.parentNote } : {})
      }] : []
    );
    let fourthPage = spreads[3];
    if (fourthPage.status === "waiting" || fourthPage.status === "reading") {
      setTeaser({ status: "reading", page: null });
      await prefetchSpreadText(fourthPage.id, fourthPage.preview);
      fourthPage = spreadsRef.current.find((spread) => spread.id === fourthPage.id) ?? fourthPage;
    }
    if (!fourthPage.text.trim()) {
      setTeaser({ status: "unavailable", page: null });
      setEmailGateVisible(true);
      return;
    }
    if (fourthPage.voiceSample && fourthPage.approvedText?.trim()) {
      setTeaser({ status: "ready", page: { page: 4, text: fourthPage.approvedText.trim() } });
      return;
    }
    teaserAbort.current?.abort();
    const controller = new AbortController();
    teaserAbort.current = controller;
    setTeaser({ status: "writing", page: null });
    try {
      const result = await postJson<{ spread: number; text: string }>("/api/translations", {
        mode: "preview",
        spread: { spread: 4, visualContext: fourthPage.visualContext, source: fourthPage.text },
        priority,
        freedom,
        bookForm,
        sourceRhyme,
        targetLanguage,
        regionalVariant,
        ...(lockedDirection ? { direction: lockedDirection } : {}),
        approvedVoice
      }, controller.signal);
      setTeaser({ status: "ready", page: { page: result.spread, text: compactGeneratedText(result.text) } });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      // Silent fallback: the gate still opens; delivery regenerates Page 4.
      console.warn("teaser_preview_failed", error instanceof Error ? error.message : error);
      setTeaser({ status: "unavailable", page: null });
      setEmailGateVisible(true);
    } finally {
      if (teaserAbort.current === controller) teaserAbort.current = null;
    }
  }

  async function captureEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const approvedVoice = spreads.flatMap((spread, index) =>
      spread.voiceSample && spread.approvedText?.trim() ? [{
        page: index + 1,
        text: spread.approvedText.trim(),
        ...(spread.parentNote ? { parentNote: spread.parentNote } : {})
      }] : []
    );
    if (
      !bookForm ||
      emailRequest.loading ||
      approvedVoice.length !== INITIAL_SAMPLE_LIMIT
    ) return;
    setEmailRequest({ loading: true, error: null });
    setAnalyticsConsent(analyticsConsent);
    const params = new URLSearchParams(window.location.search);
    try {
      const leadRequest = postJson<{ receipt: string }>("/api/leads", {
        email,
        marketingConsent,
        capturedAt: new Date().toISOString(),
        attribution: {
          source: params.get("utm_source") || "",
          medium: params.get("utm_medium") || "",
          campaign: params.get("utm_campaign") || "",
          content: params.get("utm_content") || "",
          term: params.get("utm_term") || "",
          landingPage: sessionStorage.getItem("bibaling_original_landing_page") ||
            `${window.location.origin}${window.location.pathname}`
        },
        languagePair: language.languagePair,
        targetLanguage,
        regionalVariant,
        bookForm
      });
      const [result] = await Promise.all([
        leadRequest,
        Promise.all(Array.from(spreadReadTasks.current.values()))
      ]);
      const deliverySpreads = spreadsRef.current;
      const unreadPage = deliverySpreads.findIndex((spread) => !spread.text.trim());
      if (unreadPage >= 0) {
        throw new Error(`We couldn’t finish reading Page ${unreadPage + 1}. Go back, try that photo again, then resubmit your email.`);
      }
      setLeadReceipt(result.receipt);
      setEmailCaptured(true);
      trackFunnelEventOnce("generate_lead", { bookForm, languagePair: language.languagePair, targetLanguage, regionalVariant });
      const delivery = await postJson<{ jobToken: string; status: "processing" }>("/api/delivery", {
        leadReceipt: result.receipt,
        recipientEmail: email,
        pages: deliverySpreads.map((spread, index) => ({
          page: index + 1,
          sourceText: spread.text.trim(),
          visualContext: spread.visualContext
        })),
        bookForm,
        sourceRhyme,
        priority,
        freedom,
        targetLanguage,
        regionalVariant,
        ...(lockedDirection ? { direction: lockedDirection } : {}),
        approvedPages: approvedVoice,
        previewPages: teaser.page ? [{ page: teaser.page.page, text: teaser.page.text }] : []
      });
      sessionStorage.setItem("bibaling_delivery_job", delivery.jobToken);
      setDeliveryJob({ token: delivery.jobToken, status: "processing", error: null });
      setEmailRequest({ loading: false, error: null });
      setStep(12);
      trackFunnelEventOnce("remaining_translation_started", { bookForm, languagePair: language.languagePair, targetLanguage, regionalVariant });
    } catch (error) {
      setEmailRequest({
        loading: false,
        error: error instanceof Error ? error.message : "We couldn’t save your email. Please try again."
      });
    }
  }

  const retry = step === 3
    ? analyzeBookForm
    : step === 6
    ? generateDirections
    : step === 7
      ? () => writeSpread1(lockedDirection ?? undefined)
      : () => startPatternTest(approvedSpread1, approvedNotes[1] || "");

  return (
    <main className="translator-shell">
      <div className="workshop-header">
        <button className="brand workshop-reset" type="button" onClick={() => { setLanguageConfirmed(false); setStep(1); }}>bibaling workshop</button>
        <div className="header-tools">
          {(step > 1 || spreads.length > 0) && (
            <button className="mock-toggle" type="button" onClick={startOver}>
              Start over
            </button>
          )}
          <button className={mockMode ? "mock-toggle active" : "mock-toggle"} type="button" onClick={toggleMockMode}>
            Mock mode {mockMode ? "on" : "off"}
          </button>
          <div className="progress"><span>{progress}</span><i><b style={{ width: `${progressPosition.current / progressPosition.total * 100}%` }} /></i></div>
        </div>
      </div>

      <section className={deliveryJob.status === "idle" ? "workshop" : "workshop workshop-finale"}>
        {step === 1 && (
          <>
            <h1>Add three photos from your book.</h1>
            <p className="lead">Choose any three clear samples. They don’t need to be in order—you’ll arrange the whole book later.</p>
            <div className="upload-onboarding">
              <figure className="photo-guide">
                <img src="/photo-guide.png" alt="A phone photographing an entire open picture book, with both facing pages fully visible." />
                <figcaption>
                  <strong>Photograph both open pages together</strong>
                  <span>Hold the book open and make sure the <b>full left and right pages</b> are visible in one photo.</span>
                </figcaption>
              </figure>
              <div className={spreads.length ? "uploads" : "uploads empty"}>
                {sampleSpreads.map((spread, index) => (
                  <label className="photo" key={spread.id}>
                    <img src={spread.preview} alt={`Book sample ${index + 1}`} />
                    <input type="file" accept="image/*" onChange={(event) => chooseFile(event, spread.id)} />
                    <span>Replace</span>
                  </label>
                ))}
                {spreads.length < INITIAL_SAMPLE_LIMIT && (
                  <label className="drop" onDrop={(event) => drop(event, INITIAL_SAMPLE_LIMIT, true)} onDragOver={(event) => event.preventDefault()}>
                    <input type="file" accept="image/*" multiple onChange={(event) => chooseFile(event)} />
                    <strong>+</strong>
                    <span>{spreads.length ? "Add the remaining samples" : "Add three sample photos"}</span>
                    {spreads.length > 0 && <small>Drop photos or click to choose multiple images</small>}
                  </label>
                )}
              </div>
            </div>
            <nav className="forward-only">
              <button
                className="primary"
                disabled={sampleSpreads.length !== INITIAL_SAMPLE_LIMIT}
                onClick={() => {
                  trackFunnelEventOnce("sample_pages_uploaded", { languagePair: language.languagePair, targetLanguage, regionalVariant });
                  setStep(2);
                }}
              >
                Continue
              </button>
            </nav>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Did we read these correctly?</h1>
            <p className="lead">If we got something wrong, edit it directly.</p>
            <div className="transcriptions">
              {sampleSpreads.map((spread, index) => (
                <article className={spread.status === "reading" ? "transcription is-reading" : "transcription"} key={spread.id} aria-busy={spread.status === "reading"}>
                  <button
                    className="zoomable-image-button"
                    type="button"
                    aria-label={`Open Sample ${index + 1} photo at full size`}
                    onClick={() => setExpandedImage({ src: spread.preview, alt: `Book sample ${index + 1}` })}
                  >
                    <img src={spread.preview} alt="" />
                  </button>
                  <div>
                    <label htmlFor={`text-${index}`}>Sample {index + 1}</label>
                    {spread.status === "reading" ? (
                      <div className="direction-progress-log transcription-progress" role="status">
                        <RotatingThinkingLine messages={readingLoadingMessages} />
                      </div>
                    ) : (
                      <textarea
                        id={`text-${index}`}
                        value={spread.text}
                        placeholder="Type or paste the English text here"
                        onChange={(event) => setSpreads((current) => current.map((item, i) =>
                          i === index ? { ...item, text: event.target.value } : item
                        ))}
                      />
                    )}
                    {spread.status === "error" && (
                      <p className="note">{spread.error}{" "}
                        <button className="retry" type="button" onClick={() => void readSpread(spread.id, spread.preview)}>Try again</button>
                      </p>
                    )}
                    {spread.uncertainty && <p className="note">{spread.uncertainty}</p>}
                  </div>
                </article>
              ))}
            </div>
            <nav>
              <button className="secondary" onClick={() => setStep(1)}>Back</button>
              <button className="primary" disabled={sampleSpreads.some((spread) => !spread.text.trim())} onClick={() => void analyzeBookForm()}>Looks right</button>
            </nav>
          </>
        )}

        {step === 3 && (
          <>
            <h1>How is this book written?</h1>
            <p className="lead">We’ve suggested a translation path. Choose the one that fits the book.</p>
            {request.loading && <ProgressLog messages={classificationLoadingMessages} />}
            {bookFormExplanation && !request.loading && (
              <p className="classification-explanation">{bookFormExplanation}</p>
            )}
            <div className="choices book-form-choices">
              {BOOK_FORM_OPTIONS.map((option) => {
                const selected = bookForm === option.value;
                return (
                  <button
                    className={selected ? "choice selected" : "choice"}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setBookForm(option.value);
                      setBookFormConfirmed(true);
                      setPriority("");
                      setDirections([]);
                      setSelectedDirection(null);
                      setLockedDirection(null);
                    }}
                    key={option.value}
                  >
                    <span className="radio" />
                    <span>
                      <strong>{option.title}{recommendedBookForm === option.value && <small className="our-read">Recommended</small>}</strong>
                      <small>{option.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            {request.error && <GenerationError title="We couldn’t recommend a path." message={request.error} retry={retry} />}
            <nav>
              <button className="secondary" onClick={backFromBookForm}>Back</button>
              <button className="primary" disabled={request.loading || !bookForm || !bookFormConfirmed} onClick={() => { setRequest({ loading: false, error: null }); setLanguageConfirmed(false); setStep(4); }}>Continue</button>
            </nav>
          </>
        )}

        {step === 4 && !languageConfirmed && (
          <>
            <h1>What language should we translate this book into?</h1>
            <p className="lead">Choose the language you want to read together.</p>
            <section className="language-choice" aria-labelledby="target-language-label">
              <div>
                <label id="target-language-label" htmlFor="target-language">Translate into</label>
                <select
                  id="target-language"
                  value={selectorValueFor(targetLanguage, regionalVariant)}
                  onChange={(event) => {
                    const [nextCode, nextVariant] = event.target.value.split(":") as [TargetLanguage, string | undefined];
                    const config = languageConfig(nextCode);
                    setTargetLanguage(nextCode);
                    setRegionalVariant(nextVariant || config.defaultVariant);
                    setLanguageFeedback("");
                    setLanguageFeedbackSaved(false);
                    setPriority("");
                    setFreedom("");
                    setDirections([]);
                    setSelectedDirection(null);
                    setLockedDirection(null);
                  }}
                >
                  {languageSelectorGroups().primary.map((option) => (
                    <option key={option.value} value={option.value}>{option.label} · {option.autonym}</option>
                  ))}
                  <optgroup label="Experimental">
                    {languageSelectorGroups().experimental.map((option) => (
                      <option key={option.value} value={option.value}>{option.label} · {option.autonym}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <p>
                {experimentalLanguage
                  ? `${language.config.name} is experimental. You’ll have an easy way to tell us what needs improvement.`
                  : language.config.status === "reviewed"
                    ? "Slovenian is Bibaling’s reviewed reference language."
                    : `${language.config.name} is ready for hands-on evaluation.`}
              </p>
            </section>
            <nav>
              <button className="secondary" onClick={() => setStep(3)}>Back</button>
              <button className="primary" onClick={() => setLanguageConfirmed(true)}>Continue</button>
            </nav>
          </>
        )}

        {step === 4 && languageConfirmed && (
          <>
            <h1>What matters most for this book?</h1>
            <p className="lead">Choose the quality we must protect.</p>
            <div className="choices">
              {prioritiesFor(bookForm).map(([value, title, description]) => (
                <button className={priority === value ? "choice selected" : "choice"} onClick={() => setPriority(value)} key={value}>
                  <span className="radio" /><span><strong>{title}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
            <nav><button className="secondary" onClick={() => setLanguageConfirmed(false)}>Back</button><button className="primary" disabled={!priority} onClick={() => setStep(5)}>Continue</button></nav>
          </>
        )}

        {step === 5 && (
          <>
            <h1>How freely should we adapt it?</h1>
            <p className="lead">Choose how closely {language.config.name} should follow the English.</p>
            <div className="choices">
              {freedomsFor(targetLanguage).map(([value, title, description]) => (
                <button className={freedom === value ? "choice selected" : "choice"} onClick={() => setFreedom(value)} key={value}>
                  <span className="radio" /><span><strong>{title}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
            <nav>
              <button className="secondary" onClick={() => setStep(4)}>Back</button>
              <button
                className="primary"
                disabled={!freedom || !bookForm}
                onClick={() => {
                  if (!bookForm) return;
                  if (nextAfterFreedom(bookForm) === "refrain_lab") void generateDirections();
                  else void writeSpread1();
                }}
              >
                Find our book’s voice
              </button>
            </nav>
          </>
        )}

        {step === 6 && bookForm === "refrain_verse" && (
          <>
            <h1>Choose the best option for the refrain.</h1>
            <p className="lead">Re-roll for a fresh set of options, or add your own.</p>
            {request.loading && <ProgressLog messages={directionLoadingMessages} progress={directionProgress} />}
            {!request.loading && directions.length > 0 && (
              <div className="direction-grid">
                {directions.map((direction, index) => {
                  const selected = selectedDirection === index;
                  return (
                    <article
                      className={selected ? "direction-card selected-card" : "direction-card"}
                      key={`${direction.name}-${index}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => { setSelectedDirection(index); setEditingDirection(null); }}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setSelectedDirection(index);
                          setEditingDirection(null);
                        }
                      }}
                    >
                      <p className="strategy">Option {(index % 3) + 1}</p>
                      {editingDirection === index ? (
                        <textarea aria-label={`Edit refrain option ${index + 1}`} value={direction.refrain} onClick={(event) => event.stopPropagation()} onChange={(event) => updateDirection(index, "refrain", event.target.value)} />
                      ) : (
                        <blockquote>{direction.refrain}</blockquote>
                      )}
                      {selected && (
                        <button className="edit-option" type="button" onClick={(event) => { event.stopPropagation(); setEditingDirection(editingDirection === index ? null : index); }}>
                          {editingDirection === index ? "Done" : "Edit"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {!request.loading && directions.length > 0 && (
              <div className="refrain-actions">
                <article className="direction-card action-card">
                  <p className="strategy">Add your own</p>
                  <textarea
                    value={customRefrain}
                    onChange={(event) => setCustomRefrain(event.target.value)}
                    placeholder="Write your refrain"
                  />
                  <button className="select-option" type="button" disabled={!customRefrain.trim()} onClick={addCustomDirection}>Use this refrain</button>
                </article>
                <article className="direction-card action-card">
                  <p className="strategy">Fresh options</p>
                  <textarea
                    value={directionFeedback}
                    onChange={(event) => setDirectionFeedback(event.target.value)}
                    placeholder="What should we try differently? (optional)"
                  />
                  <button className="select-option" type="button" onClick={() => void generateDirections(true)}>Re-roll</button>
                </article>
              </div>
            )}
            {request.error && (
              <GenerationError
                title={request.errorCode === "FINAL_SET_INVALID" ? "We couldn’t prepare these options." : undefined}
                message={request.error}
                retry={retry}
              />
            )}
            <nav><button className="secondary" onClick={() => request.loading ? cancelDirections(true) : setStep(5)}>Back</button><button className="primary" disabled={request.loading || selectedDirection === null || !directions[selectedDirection]?.refrain.trim()} onClick={() => void lockDirectionAndWriteSpread1()}>Lock this direction</button></nav>
          </>
        )}

        {step === 7 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>Let’s test the voice on one full page.</h1>
            <p className="lead">Choose and edit the strongest {language.config.name} version.</p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} targetLanguage={targetLanguage} />
            <Source spread={sampleSpreads[0]} number={1} onExpand={setExpandedImage} label="Sample" />
            {request.loading && <ProgressLog messages={languageLoadingMessages(translationLoadingMessages, language.config.name)} />}
            {!request.loading && <OptionList options={spread1Options} selection={spread1Selection} onSelect={setSpread1Selection} onEdit={updateSpread1Option} onNote={updateSpread1Note} />}
            {!request.loading && spread1Options.length > 0 && (
              <div className="translation-reroll">
                <button className="secondary" type="button" onClick={() => void rerollSpread1()}>
                  Re-roll three new options
                </button>
              </div>
            )}
            {!request.loading && experimentalLanguage && spread1Options.length > 0 && (
              <aside className="language-feedback">
                <label htmlFor="language-feedback">What should sound better in this {language.config.name} version?</label>
                <textarea
                  id="language-feedback"
                  value={languageFeedback}
                  onChange={(event) => { setLanguageFeedback(event.target.value); setLanguageFeedbackSaved(false); }}
                  placeholder="A short note for our language evaluation"
                />
                <button className="secondary" type="button" disabled={!languageFeedback.trim()} onClick={saveExperimentalLanguageFeedback}>
                  {languageFeedbackSaved ? "Feedback saved" : "Save feedback"}
                </button>
              </aside>
            )}
            {request.error && <GenerationError message={request.error} retry={retry} />}
            <nav>
              <button className="secondary" disabled={request.loading} onClick={() => setStep(page1BackStep(bookForm))}>Back</button>
              <button
                className="primary"
                disabled={request.loading || spread1Selection === null || !spread1Options[spread1Selection]?.text.trim()}
                onClick={() => void approveSpread1AndPatternTest()}
              >
                Approve and test the pattern
              </button>
            </nav>
          </>
        )}

        {step === 8 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>Does this voice work on every page?</h1>
            <p className="lead">Choose one version for each sample. Use Sample 1 as your guide.</p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} targetLanguage={targetLanguage} />
            <article className="approved-card voice-reference">
              <button className="zoomable-image-button" type="button" aria-label="Open approved Sample 1 photo at full size" onClick={() => setExpandedImage({ src: sampleSpreads[0].preview, alt: "Approved Sample 1" })}>
                <img src={sampleSpreads[0].preview} alt="" />
              </button>
              <label>Approved Sample 1 · voice reference</label>
              <p>{approvedSpread1}</p>
              {approvedNotes[1] && <p className="parent-edit-note"><strong>Parent’s note</strong>{approvedNotes[1]}</p>}
            </article>
            {request.loading && <ProgressLog messages={languageLoadingMessages(patternLoadingMessages, language.config.name)} />}
            {!request.loading && [2, 3].map((number) => (
              <section className="pattern-section" key={number}>
                <Source spread={sampleSpreads[number - 1]} number={number} onExpand={setExpandedImage} label="Sample" />
                <OptionList
                  options={patternOptions[number] || []}
                  selection={patternSelections[number]}
                  onSelect={(index) => setPatternSelections((current) => ({ ...current, [number]: index }))}
                  onEdit={(index, text) => updatePatternOption(number, index, text)}
                  onNote={(index, note) => updatePatternNote(number, index, note)}
                />
              </section>
            ))}
            {request.error && <GenerationError message={request.error} retry={retry} />}
            <nav>
              <button className="secondary" disabled={request.loading} onClick={() => setStep(7)}>Back</button>
              <button className="primary" disabled={request.loading || patternSelections[2] === null || patternSelections[3] === null} onClick={approvePattern}>Review all three</button>
            </nav>
          </>
        )}

        {step === 9 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>Do these belong in the same book?</h1>
            <p className="lead">Read them aloud and tune any line that feels off.</p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} targetLanguage={targetLanguage} />
            <div className="approved-grid">
              {[1, 2, 3].map((number) => (
                <article className="approved-card" key={number}>
                  <button className="zoomable-image-button" type="button" aria-label={`Open Sample ${number} photo at full size`} onClick={() => setExpandedImage({ src: sampleSpreads[number - 1].preview, alt: `Sample ${number}` })}>
                    <img src={sampleSpreads[number - 1].preview} alt="" />
                  </button>
                  <label>Sample {number}</label>
                  <textarea value={approvedDrafts[number] || ""} onChange={(event) => setApprovedDrafts((current) => ({ ...current, [number]: event.target.value }))} />
                  {approvedNotes[number] && <p className="parent-edit-note"><strong>Parent’s note</strong>{approvedNotes[number]}</p>}
                </article>
              ))}
            </div>
            <nav>
              <button className="secondary" onClick={() => setStep(8)}>Back</button>
              <button className="primary" disabled={[1, 2, 3].some((number) => !approvedDrafts[number]?.trim())} onClick={startRestOfBook}>Add the rest of the book</button>
            </nav>
          </>
        )}

        {step === 10 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>Arrange the whole book.</h1>
            <p className="lead">Add the remaining photos, then drag every photo into reading order.</p>
            {spreads.length < MAX_BOOK_PAGES && (
              <label
                className="rest-drop"
                onDrop={(event) => drop(event, MAX_BOOK_PAGES, false)}
                onDragOver={(event) => event.preventDefault()}
              >
                <input type="file" accept="image/*" multiple onChange={(event) => chooseFile(event, undefined, MAX_BOOK_PAGES, false)} />
                <strong>+</strong>
                <span>Drop all remaining book photos here</span>
                <small>You can select several photos at once.</small>
              </label>
            )}
            <div className="order-heading">
              <div><strong>Book order</strong><small>{spreads.length} photos · drag to rearrange</small></div>
            </div>
            <div className="book-order">
              {spreads.map((spread, index) => (
                <article
                  className={draggedPage === spread.id ? "page-order-card dragging" : "page-order-card"}
                  key={spread.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", spread.id);
                    setDraggedPage(spread.id);
                  }}
                  onDragEnd={() => setDraggedPage(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (draggedPage && draggedPage !== spread.id) moveBookPage(draggedPage, spread.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDraggedPage(null);
                  }}
                >
                  <div className="page-number">{index + 1}</div>
                  <img src={spread.preview} alt={`Book page ${index + 1}`} />
                  <div className="page-order-meta">
                    <strong>{spread.file?.name || `Book photo ${index + 1}`}</strong>
                    <small>
                      {spread.status === "error"
                          ? "Couldn’t read this photo"
                          : spread.voiceSample
                            ? "Approved voice sample"
                            : "New page"}
                    </small>
                    {spread.status === "error" && (
                      <button className="retry" type="button" onClick={() => void prefetchSpreadText(spread.id, spread.preview)}>Try again</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <nav>
              <button className="secondary" onClick={() => setStep(9)}>Back</button>
              <button
                className="primary"
                disabled={spreads.length <= INITIAL_SAMPLE_LIMIT || spreads.some((spread) => spread.status === "error" || (spread.status === "done" && !spread.text.trim()))}
                onClick={() => {
                  trackFunnelEventOnce("all_photos_uploaded", { bookForm, languagePair: language.languagePair, targetLanguage, regionalVariant });
                  void startTeaser();
                }}
              >
                Translate the full book
              </button>
            </nav>
          </>
        )}

        {step === 11 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>Now let’s keep going, one page at a time.</h1>
            <p className="lead">
              {teaser.status === "reading"
                ? "We’re reading Page 4 before carrying your approved voice into it."
                : teaser.status === "writing"
                  ? "Your approved voice is carrying into the next page."
                : teaser.status === "ready"
                  ? "Page 4 is ready. Here comes the next one."
                  : "We’ll translate every remaining page, check the whole book, and email it to you."}
            </p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} targetLanguage={targetLanguage} />
            {spreads.length > 3 && (
              <article className="approved-card voice-reference teaser-card" aria-busy={teaser.status === "reading" || teaser.status === "writing"}>
                <button className={teaser.status === "reading" ? "zoomable-image-button image-is-reading" : "zoomable-image-button"} type="button" aria-label="Open Page 4 photo at full size" disabled={teaser.status === "reading"} onClick={() => setExpandedImage({ src: spreads[3].preview, alt: "Page 4" })}>
                  <img src={spreads[3].preview} alt="" />
                  {teaser.status === "reading" && <span className="photo-reading-loader" aria-hidden="true"><i /></span>}
                </button>
                <label>{teaser.status === "reading" ? "Page 4 · reading the text" : teaser.status === "ready" ? "Page 4 · written in your voice" : "Page 4"}</label>
                {teaser.status === "reading"
                  ? <p className="reading-page-copy">Reading the words on this page…</p>
                  : teaser.status === "writing"
                  ? <ProgressLog messages={languageLoadingMessages(teaserLoadingMessages, language.config.name)} />
                  : teaser.status === "ready" && teaser.page
                    ? <p className="approved-translation">{teaser.page.text}</p>
                    : <p>We’ll write Page 4 with the rest of your book.</p>}
              </article>
            )}
            {teaser.status === "ready" && spreads.length > 4 && !emailGateVisible && (
              <article className="approved-card voice-reference next-page-card" aria-busy="true">
                <button className="zoomable-image-button" type="button" aria-label="Open Page 5 photo at full size" onClick={() => setExpandedImage({ src: spreads[4].preview, alt: "Page 5" })}>
                  <img src={spreads[4].preview} alt="" />
                </button>
                <label>Page 5</label>
                <ProgressLog messages={languageLoadingMessages(nextPageLoadingMessages, language.config.name)} />
              </article>
            )}
            {teaser.status !== "reading" && teaser.status !== "writing" && emailGateVisible && !emailCaptured && (
              <div className={spreads.length > 4 ? "page-gate-row" : undefined}>
                {spreads.length > 4 && (
                  <button className="zoomable-image-button gate-page-image" type="button" aria-label="Open Page 5 photo at full size" onClick={() => setExpandedImage({ src: spreads[4].preview, alt: "Page 5" })}>
                    <img src={spreads[4].preview} alt="" />
                    <span>Page 5</span>
                  </button>
                )}
                <form className="email-gate" onSubmit={captureEmail}>
                  <h2>{spreads.length > 4 ? "Keep Page 5 going." : "Let’s finish your whole book."}</h2>
                  <p>Enter your email and we’ll continue with the next page, finish the book, and send you the completed translation.</p>
                  <label>
                    <span>Email</span>
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
                  </label>
                  <label className="consent-choice">
                    <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
                    <span>Send me occasional Bibaling news and product updates.</span>
                  </label>
                  <label className="consent-choice">
                    <input
                      type="checkbox"
                      checked={analyticsConsent}
                      onChange={(event) => {
                        setAnalyticsConsentChoice(event.target.checked);
                        setAnalyticsConsent(event.target.checked);
                      }}
                    />
                    <span>Allow anonymous usage analytics to help improve Bibaling.</span>
                  </label>
                  {emailRequest.error && <p className="email-gate-error">{emailRequest.error}</p>}
                  <button
                    className="primary"
                    type="submit"
                    disabled={emailRequest.loading || !validEmail(email)}
                  >
                    {emailRequest.loading ? "Starting your book…" : "Email me the finished translation"}
                  </button>
                </form>
              </div>
            )}
            <nav>
              <button className="secondary" disabled={emailRequest.loading} onClick={() => setStep(10)}>Back</button>
            </nav>
          </>
        )}

        {step === 12 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <div className={`delivery-finale delivery-${deliveryJob.status}`} aria-live="polite">
            <img
              className="delivery-illustration"
              src="/illustrations/book-translation-on-its-way.png"
              alt=""
            />
            <div className="delivery-finale-copy">
              <span className="delivery-kicker">
                {deliveryJob.status === "completed"
                  ? "Book complete"
                  : deliveryJob.status === "failed"
                    ? "Almost there"
                    : "The final chapter"}
              </span>
              <h1>
                {deliveryJob.status === "completed"
                  ? "Your translation is on its way!"
                  : deliveryJob.status === "failed"
                    ? "We couldn’t send your translation."
                    : "Your translation is being sent."}
              </h1>
              <p className="lead">
                {deliveryJob.status === "completed"
                  ? `We sent the completed ${language.config.name} translation to ${deliveryRecipient}.`
                  : deliveryJob.status === "failed"
                    ? "Your approved work is still here, so you can try sending the book again."
                    : `We’re finishing the last pages and will email the complete ${language.config.name} translation to ${deliveryRecipient}.`}
              </p>
              {deliveryJob.status === "processing" && (
                <div className="delivery-status" role="status" aria-live="polite">
                  <span className="delivery-spinner" aria-hidden="true" />
                  <span>You can safely close this page—we’ll take it from here.</span>
                </div>
              )}
              {deliveryJob.status === "completed" && (
                <p className="delivery-celebration">You did it—your family has a new story to read together.</p>
              )}
              {deliveryJob.error && (
                <GenerationError
                  title="The email didn’t make it out."
                  message={deliveryJob.error}
                  retry={() => {
                    sessionStorage.removeItem("bibaling_delivery_job");
                    setDeliveryJob({ token: "", status: "idle", error: null });
                    setStep(10);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </section>
      {expandedImage && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Expanded book page" onClick={() => setExpandedImage(null)}>
          <button type="button" className="image-lightbox-close" onClick={() => setExpandedImage(null)}>Close</button>
          <img src={expandedImage.src} alt={expandedImage.alt} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </main>
  );
}

const directionLoadingMessages = [
  "Reading your book…",
  "Finding its voice…",
  "Trying a few different directions…",
  "Listening to how they sound aloud…",
  "Making sure the Slovenian feels natural…",
  "Polishing the strongest ideas…",
  "Choosing the best three…",
  "Exploring how the story could flow…",
  "Finding words that feel good to say…",
  "Looking for the book’s natural rhythm…",
  "Trying another way to tell it…",
  "Shaping the repeated lines…",
  "Comparing a few strong possibilities…",
  "Making every line feel at home…",
  "Keeping the story clear and playful…",
  "Giving each idea a careful read…",
  "Finding the warmest way to say it…",
  "Making the words sing together…",
  "Bringing the strongest voices forward…",
  "Giving the final choices one more listen…"
];

const classificationLoadingMessages = [
  "Reading how the three samples are structured…",
  "Checking whether a meaningful line really repeats…",
  "Listening for prose, poetic movement, and rhyme…",
  "Choosing the translation path that best fits the source…"
];

const readingLoadingMessages = [
  "Reading the words on this page…",
  "Checking the line breaks…",
  "Looking closely at the page…",
  "Matching the words to the picture…",
  "Checking names and repeated phrases…",
  "Making sure no line was missed…",
  "Reading the small print carefully…",
  "Giving the transcription one last check…"
];

const translationLoadingMessages = [
  "Trying several Slovenian versions…",
  "Listening to each version aloud…",
  "Checking the meaning against the page…",
  "Finding a more natural rhythm…",
  "Trying another rhyme structure…",
  "Keeping the approved refrain exact…",
  "Making the Slovenian feel effortless…",
  "Comparing the strongest drafts…",
  "Checking every ending aloud…",
  "Keeping the picture details intact…",
  "Polishing the most promising version…",
  "Making sure the narrator sounds consistent…",
  "Trying a different line shape…",
  "Checking that nothing feels forced…",
  "Keeping the language clear for children…",
  "Testing the cadence one more time…",
  "Looking for the warmest natural phrasing…",
  "Making the rhyme work in real speech…",
  "Giving the strongest choices a final read…",
  "Preparing three choices for you…"
];

const patternLoadingMessages = [
  "Carrying your approved voice forward…",
  "Testing the refrain on the next page…",
  "Keeping the rhythm consistent…",
  "Applying your edits to the next choices…",
  "Checking both pages side by side…",
  "Making sure the voice travels naturally…",
  ...translationLoadingMessages
];

const teaserLoadingMessages = [
  "Writing Page 4 in your book’s voice…",
  "Carrying your refrain into the next page…",
  "Keeping the rhythm you approved…",
  "Following your notes from the first three pages…",
  "Reading Page 4 aloud to check the flow…",
  ...translationLoadingMessages
];

const nextPageLoadingMessages = [
  "Starting Page 5 in your book’s voice…",
  "Carrying your rhythm into the next page…",
  "Following the choices you approved…"
];

const fullBookLoadingMessages = [
  "Reading the remaining pages…",
  "Following the story from beginning to end…",
  "Carrying your approved voice through the book…",
  "Applying your rhyme feedback everywhere…",
  "Keeping repeated language consistent…",
  "Checking the full story arc…",
  "Making each page sound like the same book…",
  "Checking every page against its picture…",
  "Listening for repeated rhyme problems…",
  "Polishing the book as one continuous read…",
  "Making sure no page was skipped…",
  "Preparing the complete editable draft…",
  ...translationLoadingMessages
];

function languageLoadingMessages(messages: readonly string[], language: string) {
  return messages.map((message) => message.replaceAll("Slovenian", language));
}

function shuffledMessages(messages: readonly string[]) {
  const shuffled = [...messages];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
  }
  return shuffled;
}

function useRotatingMessage(messages: readonly string[]) {
  const [shuffled] = useState(() => shuffledMessages(messages));
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    let rotation: number;
    let nextIndex = 1;
    const showAnotherMessage = () => {
      const delay = 5000 + Math.floor(Math.random() * 3001);
      rotation = window.setTimeout(() => {
        setMessageIndex(nextIndex);
        nextIndex += 1;
        if (nextIndex < shuffled.length) showAnotherMessage();
      }, delay);
    };
    showAnotherMessage();
    return () => window.clearTimeout(rotation);
  }, [shuffled.length]);

  return { message: shuffled[messageIndex], messageIndex };
}

function RotatingThinkingLine({ messages }: { messages: readonly string[] }) {
  const { message, messageIndex } = useRotatingMessage(messages);
  return (
    <div className="thinking-line" key={messageIndex}>
      <span className="pencil-loader" aria-hidden="true"><i /><em /></span>
      <b>{message}</b>
    </div>
  );
}

function ProgressLog({
  messages,
  activePage
}: {
  messages: readonly string[];
  progress?: DirectionProgress;
  activePage?: {
    number: number;
    preview: string;
    sourceText: string;
    phase: string;
  };
}) {
  const [showReassurance, setShowReassurance] = useState(false);

  useEffect(() => {
    const reassurance = window.setTimeout(() => setShowReassurance(true), 25000);
    return () => window.clearTimeout(reassurance);
  }, []);

  return (
    <div className="direction-progress-log" aria-live="polite">
      {activePage && (
        <div className="progress-page-context">
          <img src={activePage.preview} alt="" />
          <div>
            <small>Page {activePage.number}</small>
            <strong>{activePage.phase}</strong>
            {activePage.sourceText && <p>{activePage.sourceText}</p>}
          </div>
        </div>
      )}
      <RotatingThinkingLine messages={messages} />
      {showReassurance && (
        <div className="progress-log-footer">
          <p>Good verse takes a little longer—we’re checking this carefully.</p>
        </div>
      )}
    </div>
  );
}

function VoiceBrief({
  bookForm,
  direction,
  priority,
  freedom,
  targetLanguage
}: {
  bookForm: BookForm;
  direction: Direction | null;
  priority: string;
  freedom: string;
  targetLanguage: TargetLanguage;
}) {
  const priorityLabel = prioritiesFor(bookForm).find(([value]) => value === priority)?.[1];
  const freedomLabel = freedomsFor(targetLanguage).find(([value]) => value === freedom)?.[1];
  return (
    <aside className="locked-brief">
      <span>{direction ? "Refrain" : "Book form"}</span>
      <blockquote>{direction?.refrain || bookFormLabel(bookForm)}</blockquote>
      <div className="brief-selections">
        <p><strong>Most important</strong><span>{priorityLabel}</span></p>
        <p><strong>Adaptation</strong><span>{freedomLabel}</span></p>
      </div>
    </aside>
  );
}

function Source({
  spread,
  number,
  onExpand,
  label = "Page"
}: {
  spread: Spread;
  number: number;
  onExpand: (image: { src: string; alt: string }) => void;
  label?: string;
}) {
  return (
    <article className="source-card">
      <button className="zoomable-image-button" type="button" aria-label={`Open ${label} ${number} photo at full size`} onClick={() => onExpand({ src: spread.preview, alt: `${label} ${number}` })}>
        <img src={spread.preview} alt="" />
      </button>
      <div><span>English source · {label} {number}</span><p>{spread.text}</p></div>
    </article>
  );
}

function OptionList({
  options,
  selection,
  onSelect,
  onEdit,
  onNote
}: {
  options: TranslationOption[];
  selection: number | null;
  onSelect: (index: number | null) => void;
  onEdit: (index: number, text: string) => void;
  onNote: (index: number, note: string) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    const deselectOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !target.closest(".option-grid") &&
        !target.closest("nav")
      ) {
        onSelect(null);
        setEditingIndex(null);
      }
    };
    document.addEventListener("pointerdown", deselectOutside);
    return () => document.removeEventListener("pointerdown", deselectOutside);
  }, [onSelect]);

  return (
    <div className="option-grid">
      {options.map((option, index) => (
        <article
          className={selection === index ? "option-card selected-card" : "option-card"}
          key={`${option.strategy}-${index}`}
          role="button"
          tabIndex={0}
          aria-pressed={selection === index}
          onClick={() => { onSelect(index); setEditingIndex(null); }}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelect(index);
              setEditingIndex(null);
            }
          }}
        >
          <p className="strategy">Option {index + 1}</p>
          {editingIndex === index ? (
            <>
              <textarea aria-label={`Edit ${option.strategy}`} value={option.text} onClick={(event) => event.stopPropagation()} onChange={(event) => onEdit(index, event.target.value)} />
              {option.text.trim() !== option.originalText.trim() && (
                <label className="edit-feedback" onClick={(event) => event.stopPropagation()}>
                  <span>What felt off in the original? <small>Optional</small></span>
                  <textarea
                    aria-label={`Comment on ${option.strategy}`}
                    value={option.editNote}
                    onChange={(event) => onNote(index, event.target.value)}
                    placeholder="For example: this phrase felt unnatural, the rhyme was weak, or the meaning drifted."
                  />
                  <small>We’ll carry this note into the next voice test.</small>
                </label>
              )}
            </>
          ) : <p className="verse">{option.text}</p>}
          {selection === index ? (
            <button type="button" className="select-option" onClick={(event) => { event.stopPropagation(); setEditingIndex(editingIndex === index ? null : index); }}>
              {editingIndex === index ? "Done" : "Edit"}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function GenerationError({
  title = "That draft didn’t finish.",
  message,
  retry
}: {
  title?: string;
  message: string;
  retry: () => void | Promise<void>;
}) {
  return (
    <div className="generation-error"><strong>{title}</strong><p>{message}</p><button type="button" onClick={() => void retry()}>Try again</button></div>
  );
}
