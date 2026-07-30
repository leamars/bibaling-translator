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

type Spread = {
  id: string;
  file: File;
  preview: string;
  text: string;
  uncertainty: string | null;
  visualContext: string;
  error: string | null;
  status: "waiting" | "reading" | "done" | "error";
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
type BookPage = {
  id: string;
  preview: string;
  fileName: string;
  sourceText: string;
  visualContext: string;
  approvedText: string | null;
  parentNote?: string;
  voiceSample?: boolean;
  workStatus?: "pending" | "reading" | "translating" | "ready" | "failed";
};

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

const freedoms = [
  ["close", "Stay close", "Preserve each page’s meaning; change only what’s necessary."],
  ["natural", "Sound naturally Slovenian", "Keep the story and pictures, but freely repair awkward lines, jokes, and rhymes."],
  ["playful", "Reimagine playfully", "Keep the events and feeling, while creating new Slovenian wordplay."]
] as const;

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
  const [bookPages, setBookPages] = useState<BookPage[]>([]);
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
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
  const fullBookAbort = useRef<AbortController | null>(null);
  const classifierAbort = useRef<AbortController | null>(null);

  const progress = useMemo(() => {
    return workshopProgress(bookForm, step);
  }, [bookForm, step]);

  useEffect(() => {
    setMockMode(document.cookie.split(";").some((part) => part.trim() === "bibaling_mock_mode=true"));
    trackFunnelEventOnce("translator_opened", { languagePair: "en-sl" });
    const syncConsent = () => setAnalyticsConsentChoice(getAnalyticsConsent() === true);
    syncConsent();
    window.addEventListener("bibaling:analytics-consent", syncConsent);
    return () => window.removeEventListener("bibaling:analytics-consent", syncConsent);
  }, []);

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
          trackFunnelEventOnce("delivery_succeeded", { bookForm: bookForm ?? undefined, languagePair: "en-sl" });
        } else if (result.status === "failed" || result.status === "cancelled") {
          setDeliveryJob((current) => ({
            ...current,
            status: "failed",
            error: "We couldn’t finish and send your translation. Please try again."
          }));
          trackFunnelEventOnce("delivery_failed", { bookForm: bookForm ?? undefined, languagePair: "en-sl" });
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
  }, [bookForm, deliveryJob.status, deliveryJob.token]);

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
      "My bright friend makes the whole forest glow. I love you all.",
      "The friends wander down a mossy path.",
      "A tiny lantern glows beside the stream.",
      "Everyone curls up safely at home."
    ];
    setSpreads(sources.map((text, index) => ({
      id: crypto.randomUUID(),
      file: new File(["mock"], `mock-page-${index + 1}.png`, { type: "image/png" }),
      preview: mockPreview(index + 1),
      text,
      uncertainty: null,
      visualContext: "A mock picture-book page.",
      error: null,
      status: "done" as const
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
        texts: spreads.slice(0, 3).map((spread) => spread.text),
        visualContexts: spreads.slice(0, 3).map((spread) => spread.visualContext)
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
    setSpreads((current) => current.map((spread) =>
      spread.id === id ? { ...spread, error: null, status: "reading" } : spread
    ));
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
      setSpreads((current) => current.map((spread) =>
        spread.id === id
          ? { ...spread, text: compactGeneratedText(result.text), uncertainty: result.uncertainty, visualContext: result.visualContext, error: null, status: "done" }
          : spread
      ));
    } catch (error) {
      setSpreads((current) => current.map((spread) =>
        spread.id === id
          ? { ...spread, error: error instanceof Error ? error.message : "We couldn’t read this page.", status: "error" }
          : spread
      ));
    }
  }

  async function addFile(file?: File, replaceId?: string) {
    if (!file || !file.type.startsWith("image/") || (!replaceId && spreads.length >= 40)) return;
    const preview = await fileToDataUrl(file);
    const id = replaceId ?? crypto.randomUUID();
    const nextSpread: Spread = {
      id, file, preview, text: "", uncertainty: null, visualContext: "", error: null, status: "waiting"
    };
    setSpreads((current) => replaceId
      ? current.map((spread) => spread.id === replaceId ? nextSpread : spread)
      : [...current, nextSpread]
    );
    void readSpread(id, preview);
  }

  async function addFiles(files?: FileList | File[]) {
    if (!files) return;
    const available = Math.max(0, 40 - spreads.length);
    const images = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, available);
    if (images.length === 0) return;

    const additions = await Promise.all(images.map(async (file) => ({
      id: crypto.randomUUID(),
      file,
      preview: await fileToDataUrl(file),
      text: "",
      uncertainty: null,
      visualContext: "",
      error: null,
      status: "waiting" as const
    })));
    setSpreads((current) => [...current, ...additions].slice(0, 40));
    additions.forEach((spread) => void readSpread(spread.id, spread.preview));
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>, replaceId?: string) {
    if (replaceId) void addFile(event.target.files?.[0], replaceId);
    else void addFiles(event.target.files ?? undefined);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void addFiles(event.dataTransfer.files);
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
          visualContexts: spreads.slice(0, 3).map((spread) => spread.visualContext),
          texts: spreads.slice(0, 3).map((spread) => spread.text),
          priority,
          freedom,
          parentFeedback: directionFeedback.trim() || undefined,
          previousRefrains: shownRefrains,
          freshDraft
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

  async function writeSpread1(direction?: Direction) {
    if (!bookForm || (bookForm === "refrain_verse" && !direction)) return;
    trackFunnelEventOnce("first_page_generation_started", { bookForm, languagePair: "en-sl" });
    const controller = new AbortController();
    translationAbort.current = controller;
    setLockedDirection(direction ?? null);
    setStep(7);
    setRequest({ loading: true, error: null });
    try {
      const result = await postJson<{ runs: Array<{ label: string; options: GeneratedOption[] }> }>("/api/translations", {
        mode: "spread1",
        visualContext: spreads[0].visualContext,
        source: spreads[0].text,
        priority,
        freedom,
        bookForm,
        sourceRhyme,
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
      trackFunnelEventOnce("first_page_translation_displayed", { bookForm, languagePair: "en-sl" });
      setEmailGateVisible(true);
      trackFunnelEventOnce("email_gate_displayed", { bookForm, languagePair: "en-sl" });
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

  function updateSpread1Option(index: number, text: string) {
    setSpread1Options((current) => current.map((option, i) => i === index ? { ...option, text } : option));
  }

  function updateSpread1Note(index: number, editNote: string) {
    setSpread1Options((current) => current.map((option, i) => i === index ? { ...option, editNote } : option));
  }

  async function startPatternTest(approved: string, approvedNote: string, captureReceipt = leadReceipt) {
    if (!captureReceipt || !bookForm || (bookForm === "refrain_verse" && !lockedDirection)) return;
    const controller = new AbortController();
    translationAbort.current = controller;
    setApprovedSpread1(approved);
    setApprovedNotes((current) => ({ ...current, 1: approvedNote }));
    setStep(8);
    setRequest({ loading: true, error: null });
    try {
      const result = await postJson<{ runs: Array<{ label: string; spreads: Array<{ spread: number; options: GeneratedOption[] }> }> }>("/api/translations", {
        mode: "pattern",
        leadReceipt: captureReceipt,
        visualContexts: [spreads[1].visualContext, spreads[2].visualContext],
        sources: [spreads[1].text, spreads[2].text],
        priority,
        freedom,
        bookForm,
        sourceRhyme,
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

  function startRestOfBook() {
    if (!emailCaptured || !leadReceipt) return;
    const samples = spreads.map((spread, index) => ({
      id: spread.id,
      preview: spread.preview,
      fileName: spread.file.name,
      sourceText: spread.text,
      visualContext: spread.visualContext,
      approvedText: approvedDrafts[index + 1] || null,
      parentNote: approvedNotes[index + 1] || undefined,
      voiceSample: true,
      workStatus: "ready" as const
    }));
    const mockRemainder = mockMode ? [4, 5, 6].map((number) => ({
      id: crypto.randomUUID(),
      preview: mockPreview(number),
      fileName: `mock-page-${number}.png`,
      sourceText: `Mock English source for page ${number}. The friends continue their adventure.`,
      visualContext: "A mock picture-book page continuing the friends’ adventure.",
      approvedText: null,
      parentNote: undefined,
      voiceSample: false,
      workStatus: "pending" as const
    })) : [];
    setBookPages([...samples, ...mockRemainder]);
    setStep(10);
  }

  async function captureEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !bookForm ||
      emailRequest.loading ||
      spread1Selection === null ||
      !spread1Options[spread1Selection]?.text.trim()
    ) return;
    const approved = spread1Options[spread1Selection].text.trim();
    const approvedNote = spread1Options[spread1Selection].editNote.trim();
    setApprovedSpread1(approved);
    setApprovedNotes((current) => ({ ...current, 1: approvedNote }));
    setEmailRequest({ loading: true, error: null });
    setAnalyticsConsent(analyticsConsent);
    const params = new URLSearchParams(window.location.search);
    try {
      const result = await postJson<{ receipt: string }>("/api/leads", {
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
        languagePair: "en-sl",
        bookForm
      });
      setLeadReceipt(result.receipt);
      setEmailCaptured(true);
      trackFunnelEventOnce("generate_lead", { bookForm, languagePair: "en-sl" });
      const delivery = await postJson<{ jobToken: string; status: "processing" }>("/api/delivery", {
        leadReceipt: result.receipt,
        recipientEmail: email,
        pages: spreads.map((spread, index) => ({ page: index + 1, sourceText: spread.text.trim() })),
        bookForm,
        sourceRhyme,
        priority,
        freedom,
        ...(lockedDirection ? { direction: lockedDirection } : {}),
        approvedPage1: approved,
        approvedPage1Note: approvedNote || undefined
      });
      sessionStorage.setItem("bibaling_delivery_job", delivery.jobToken);
      setDeliveryJob({ token: delivery.jobToken, status: "processing", error: null });
      setEmailRequest({ loading: false, error: null });
      setStep(8);
      trackFunnelEventOnce("remaining_translation_started", { bookForm, languagePair: "en-sl" });
    } catch (error) {
      setEmailRequest({
        loading: false,
        error: error instanceof Error ? error.message : "We couldn’t save your email. Please try again."
      });
    }
  }

  async function addRemainingFiles(files?: FileList | File[]) {
    if (!files) return;
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    const additions = await Promise.all(images.map(async (file) => ({
      id: crypto.randomUUID(),
      preview: await fileToDataUrl(file),
      fileName: file.name,
      sourceText: "",
      visualContext: "",
      approvedText: null,
      parentNote: undefined,
      voiceSample: false,
      workStatus: "pending" as const
    })));
    setBookPages((current) => [...current, ...additions]);
  }

  function moveBookPage(fromId: string, toId: string) {
    if (fromId === toId) return;
    setBookPages((current) => {
      const from = current.findIndex((page) => page.id === fromId);
      const to = current.findIndex((page) => page.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function generateRestOfBook() {
    if (!emailCaptured || !leadReceipt || !bookForm || (bookForm === "refrain_verse" && !lockedDirection) || fullBookAbort.current) return;
    const controller = new AbortController();
    fullBookAbort.current = controller;
    setStep(11);
    setRequest({ loading: true, error: null });
    try {
      const working = bookPages.map((page) => ({ ...page }));
      const approvedVoice = working.flatMap((page, index) =>
        page.voiceSample && page.approvedText ? [{
            spread: index + 1,
            text: page.approvedText,
            parentNote: page.parentNote || undefined
          }] : []
      );
      for (let index = 0; index < working.length; index += 1) {
        if (working[index].approvedText?.trim()) {
          working[index].workStatus = "ready";
          continue;
        }
        try {
          if (!working[index].sourceText.trim()) {
            working[index].workStatus = "reading";
            setBookPages(working.map((page) => ({ ...page })));
            const transcription = await postJson<{ text: string; visualContext: string }>(
              "/api/transcribe",
              { image: working[index].preview },
              controller.signal
            );
            working[index].sourceText = compactGeneratedText(transcription.text);
            working[index].visualContext = transcription.visualContext;
          }
          working[index].workStatus = "translating";
          setBookPages(working.map((page) => ({ ...page })));
          const result = await postJson<{ spreads: Array<{ spread: number; text: string }> }>("/api/translations", {
            mode: "fullbook",
            leadReceipt,
            spreads: [{
              spread: index + 1,
              visualContext: working[index].visualContext,
              source: working[index].sourceText
            }],
            priority,
            freedom,
            bookForm,
            sourceRhyme,
            ...(lockedDirection ? { direction: lockedDirection } : {}),
            approvedVoice
          }, controller.signal);
          const translation = result.spreads.find((spread) => spread.spread === index + 1)?.text;
          if (!translation?.trim()) throw new Error(`Page ${index + 1} returned without a translation.`);
          working[index].approvedText = compactGeneratedText(translation);
          working[index].workStatus = "ready";
          setBookPages(working.map((page) => ({ ...page })));
        } catch (error) {
          working[index].workStatus = "failed";
          setBookPages(working.map((page) => ({ ...page })));
          throw new Error(
            `We couldn’t finish Page ${index + 1}. Everything before it is saved—try again to continue.`,
            { cause: error }
          );
        }
      }
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (fullBookAbort.current === controller) setRequest({ loading: false, error: null });
      } else {
        setRequest({
          loading: false,
          error: error instanceof Error ? error.message : "We couldn’t finish the full book. Everything approved so far is still here."
        });
      }
    } finally {
      if (fullBookAbort.current === controller) fullBookAbort.current = null;
    }
  }

  function restartFullBook() {
    fullBookAbort.current?.abort();
    fullBookAbort.current = null;
    setRequest({ loading: false, error: null });
    window.setTimeout(() => void generateRestOfBook(), 0);
  }

  function updateBookTranslation(index: number, approvedText: string) {
    setBookPages((current) => current.map((page, pageIndex) =>
      pageIndex === index ? { ...page, approvedText } : page
    ));
  }

  function saveFinishedDraft() {
    const text = bookPages
      .map((page, index) => `PAGE ${index + 1}\n${page.approvedText?.trim() || ""}`)
      .join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bibaling-slovenian-draft.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const retry = step === 3
    ? analyzeBookForm
    : step === 6
    ? generateDirections
    : step === 7
      ? () => writeSpread1(lockedDirection ?? undefined)
      : step === 11
        ? generateRestOfBook
        : () => startPatternTest(approvedSpread1, approvedNotes[1] || "");
  const activeBookPageIndex = bookPages.findIndex((page) =>
    page.workStatus === "reading" || page.workStatus === "translating"
  );

  return (
    <main className={`translator-shell translator-step-${step}`}>
      <div className="workshop-header">
        <button className="brand workshop-reset" type="button" onClick={() => setStep(1)} aria-label="Return to the start of the Bibaling translator">
          <span className="brand-mark" aria-hidden="true"><span /><span /></span>
          <span>Bibaling</span>
        </button>
        <div className="header-tools">
          <button className={mockMode ? "mock-toggle active" : "mock-toggle"} type="button" onClick={toggleMockMode}>
            Mock mode {mockMode ? "on" : "off"}
          </button>
          <div className="progress" aria-label={`Step ${progress.current} of ${progress.total}`}>
            <span>{progress.current} of {progress.total}</span>
            <i role="progressbar" aria-valuemin={1} aria-valuemax={progress.total} aria-valuenow={progress.current}>
              <b style={{ width: `${progress.current / progress.total * 100}%` }} />
            </i>
          </div>
        </div>
      </div>

      <section className="workshop">
        <div className="workshop-orientation" aria-hidden="true">
          <span />
          English to Slovenian
        </div>
        {step === 1 && (
          <>
            <h1>Add every page from your book.</h1>
            <p className="lead">Photograph the whole book in reading order. We’ll use the first three pages to find its voice.</p>
            <div className="upload-onboarding">
              <figure className="photo-guide">
                <img src="/photo-guide.png" alt="A phone photographing an entire open picture book, with both facing pages fully visible." />
                <figcaption>
                  <strong>Photograph both open pages together</strong>
                  <span>Hold the book open and make sure the <b>full left and right pages</b> are visible in one photo.</span>
                </figcaption>
              </figure>
              <div className={spreads.length ? "uploads" : "uploads empty"}>
                {spreads.map((spread, index) => (
                  <label className="photo" key={spread.id}>
                    <img src={spread.preview} alt={`Book page ${index + 1}`} />
                    <input type="file" accept="image/*" onChange={(event) => chooseFile(event, spread.id)} />
                    <span>Replace</span>
                  </label>
                ))}
                {spreads.length < 40 && (
                  <label className="drop" onDrop={drop} onDragOver={(event) => event.preventDefault()}>
                    <input type="file" accept="image/*" multiple onChange={(event) => chooseFile(event)} />
                    <strong>+</strong>
                    <span>{spreads.length ? "Add more book photos" : "Add all book photos"}</span>
                  </label>
                )}
              </div>
            </div>
            <nav className="forward-only">
              <button
                className="primary"
                disabled={spreads.length < 3}
                onClick={() => {
                  trackFunnelEventOnce("all_photos_uploaded", { languagePair: "en-sl" });
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
              {spreads.map((spread, index) => (
                <article className={spread.status === "reading" ? "transcription is-reading" : "transcription"} key={spread.id} aria-busy={spread.status === "reading"}>
                  <button
                    className="zoomable-image-button"
                    type="button"
                    aria-label={`Open Page ${index + 1} photo at full size`}
                    onClick={() => setExpandedImage({ src: spread.preview, alt: `Book page ${index + 1}` })}
                  >
                    <img src={spread.preview} alt="" />
                  </button>
                  <div>
                    <label htmlFor={`text-${index}`}>Page {index + 1}</label>
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
              <button className="primary" disabled={spreads.some((spread) => !spread.text.trim())} onClick={() => void analyzeBookForm()}>Looks right</button>
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
              <button className="primary" disabled={request.loading || !bookForm || !bookFormConfirmed} onClick={() => { setRequest({ loading: false, error: null }); setStep(4); }}>Continue</button>
            </nav>
          </>
        )}

        {step === 4 && (
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
            <nav><button className="secondary" onClick={() => setStep(3)}>Back</button><button className="primary" disabled={!priority} onClick={() => setStep(5)}>Continue</button></nav>
          </>
        )}

        {step === 5 && (
          <>
            <h1>How freely should we adapt it?</h1>
            <p className="lead">Choose how closely Slovenian should follow the English.</p>
            <div className="choices">
              {freedoms.map(([value, title, description]) => (
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
            <p className="lead">Choose and edit the strongest Slovenian version.</p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} />
            <Source spread={spreads[0]} number={1} onExpand={setExpandedImage} />
            {request.loading && <ProgressLog messages={translationLoadingMessagesFor(bookForm)} />}
            {!request.loading && <OptionList options={spread1Options} selection={spread1Selection} onSelect={setSpread1Selection} onEdit={updateSpread1Option} onNote={updateSpread1Note} />}
            {request.error && <GenerationError message={request.error} retry={retry} />}
            {!request.loading && emailGateVisible && !emailCaptured && spread1Options.length > 0 && (
              <form className="email-gate" onSubmit={captureEmail}>
                <h2>Like your first page? Let’s finish the book.</h2>
                <p>Enter the email address where you’d like us to send the completed translation.</p>
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
                  disabled={
                    emailRequest.loading ||
                    !validEmail(email) ||
                    spread1Selection === null ||
                    !spread1Options[spread1Selection]?.text.trim()
                  }
                >
                  {emailRequest.loading ? "Starting your book…" : "Email me the finished translation"}
                </button>
              </form>
            )}
            <nav>
              <button className="secondary" disabled={request.loading} onClick={() => setStep(page1BackStep(bookForm))}>Back</button>
            </nav>
          </>
        )}

        {step === 8 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>{deliveryJob.status === "completed" ? "Your translation is on its way." : deliveryJob.status === "failed" ? "We couldn’t finish your book." : "We’re finishing your book."}</h1>
            <p className="lead">
              {deliveryJob.status === "completed"
                ? `We sent the completed translation to ${email.trim()}.`
                : deliveryJob.status === "failed"
                ? "Your photos and Page 1 choice are still here. Try starting the delivery again."
                : `We’re translating each remaining page, checking the whole book, and will email it to ${email.trim()}. You can safely close this page.`}
            </p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} />
            <article className="approved-card voice-reference">
              <button className="zoomable-image-button" type="button" aria-label="Open approved Page 1 photo at full size" onClick={() => setExpandedImage({ src: spreads[0].preview, alt: "Approved Page 1" })}>
                <img src={spreads[0].preview} alt="" />
              </button>
              <label>Approved Page 1</label>
              <p>{approvedSpread1}</p>
              {approvedNotes[1] && <p className="parent-edit-note"><strong>Parent’s note</strong>{approvedNotes[1]}</p>}
            </article>
            {deliveryJob.status === "processing" && <ProgressLog messages={fullBookLoadingMessagesFor(bookForm)} />}
            {deliveryJob.error && <GenerationError message={deliveryJob.error} retry={() => setStep(7)} />}
          </>
        )}

        {step === 9 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>Do these belong in the same book?</h1>
            <p className="lead">Read them aloud and tune any line that feels off.</p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} />
            <div className="approved-grid">
              {[1, 2, 3].map((number) => (
                <article className="approved-card" key={number}>
                  <button className="zoomable-image-button" type="button" aria-label={`Open Page ${number} photo at full size`} onClick={() => setExpandedImage({ src: spreads[number - 1].preview, alt: `Page ${number}` })}>
                    <img src={spreads[number - 1].preview} alt="" />
                  </button>
                  <label>Page {number}</label>
                  <textarea value={approvedDrafts[number] || ""} onChange={(event) => setApprovedDrafts((current) => ({ ...current, [number]: event.target.value }))} />
                  {approvedNotes[number] && <p className="parent-edit-note"><strong>Parent’s note</strong>{approvedNotes[number]}</p>}
                </article>
              ))}
            </div>
            <nav>
              <button className="secondary" onClick={() => setStep(8)}>Back</button>
              <button className="primary" disabled={!emailCaptured || !leadReceipt || [1, 2, 3].some((number) => !approvedDrafts[number]?.trim())} onClick={() => startRestOfBook()}>Add the rest of the book</button>
            </nav>
          </>
        )}

        {step === 10 && emailCaptured && (
          <>
            <h1>Arrange the whole book.</h1>
            <p className="lead">Add the remaining photos, then drag every page into order.</p>
            <label
              className="rest-drop"
              onDrop={(event) => { event.preventDefault(); void addRemainingFiles(event.dataTransfer.files); }}
              onDragOver={(event) => event.preventDefault()}
            >
              <input type="file" accept="image/*" multiple onChange={(event) => { void addRemainingFiles(event.target.files ?? undefined); event.target.value = ""; }} />
              <strong>+</strong>
              <span>Drop all remaining book photos here</span>
            </label>

            <div className="order-heading">
              <div><strong>Book order</strong><small>{bookPages.length} pages · drag to rearrange</small></div>
            </div>
            <div className="book-order">
              {bookPages.map((page, index) => (
                <article
                  className={draggedPage === page.id ? "page-order-card dragging" : "page-order-card"}
                  key={page.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", page.id);
                    setDraggedPage(page.id);
                  }}
                  onDragEnd={() => setDraggedPage(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (draggedPage && draggedPage !== page.id) moveBookPage(draggedPage, page.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDraggedPage(null);
                  }}
                >
                  <div className="page-number">{index + 1}</div>
                  <img src={page.preview} alt={`Book page ${index + 1}`} />
                  <div className="page-order-meta">
                    <strong>{page.fileName}</strong>
                    <small>{page.approvedText ? "Approved voice sample" : "New page"}</small>
                  </div>
                </article>
              ))}
            </div>
            <nav>
              <button className="secondary" onClick={() => setStep(9)}>Back</button>
              <button className="primary" disabled={bookPages.length < 3} onClick={() => void generateRestOfBook()}>
                Translate the full book
              </button>
            </nav>
          </>
        )}

        {step === 11 && bookForm && (bookForm !== "refrain_verse" || lockedDirection) && (
          <>
            <h1>{request.loading ? "Writing the rest of your book." : request.error ? "Let’s finish the unread pages." : "Your full Slovenian draft."}</h1>
            <p className="lead">
              {request.loading
                ? "We’re carrying your approved voice through every page."
                : request.error
                ? "Everything we’ve read is saved. Try again to continue."
                : "Read each page, edit any line, then save your draft."}
            </p>
            <VoiceBrief bookForm={bookForm} direction={lockedDirection} priority={priority} freedom={freedom} />
            {request.loading && (
              <>
                <div className="full-book-draft approved-while-writing">
                  {bookPages.map((page, index) => ({ page, index }))
                    .filter(({ page }) => page.approvedText)
                    .map(({ page, index }) => (
                    <article className="approved-card page-ready" key={page.id}>
                      <button className="zoomable-image-button" type="button" aria-label={`Open approved Page ${index + 1} photo at full size`} onClick={() => setExpandedImage({ src: page.preview, alt: `Approved Page ${index + 1}` })}>
                        <img src={page.preview} alt="" />
                      </button>
                      <div className="english-column">
                        <label>Page {index + 1} · English</label>
                        <p className="english-reference">{page.sourceText || "Reading this page…"}</p>
                      </div>
                      <div className="slovenian-column">
                        <label>Slovenian · ready</label>
                        <p className="approved-translation">{page.approvedText}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <ProgressLog
                  messages={fullBookLoadingMessagesFor(bookForm)}
                  activePage={activeBookPageIndex >= 0 ? {
                    number: activeBookPageIndex + 1,
                    preview: bookPages[activeBookPageIndex].preview,
                    sourceText: bookPages[activeBookPageIndex].sourceText,
                    phase: bookPages[activeBookPageIndex].workStatus === "reading" ? "Reading the English text" : "Writing the Slovenian translation"
                  } : undefined}
                />
              </>
            )}
            {!request.loading && (
              <div className="full-book-draft">
                {bookPages.map((page, index) => (
                  <article className="approved-card" key={page.id}>
                    <button className="zoomable-image-button" type="button" aria-label={`Open Page ${index + 1} photo at full size`} onClick={() => setExpandedImage({ src: page.preview, alt: `Page ${index + 1}` })}>
                      <img src={page.preview} alt="" />
                    </button>
                    <div className="english-column">
                      <label>Page {index + 1} · English</label>
                      <p className="english-reference">{page.sourceText}</p>
                    </div>
                    <div className="slovenian-column">
                      <label htmlFor={`slovenian-page-${index + 1}`}>Slovenian</label>
                      <textarea
                        id={`slovenian-page-${index + 1}`}
                        value={page.approvedText || ""}
                        onChange={(event) => updateBookTranslation(index, event.target.value)}
                      />
                    </div>
                    {page.parentNote && <p className="parent-edit-note"><strong>Parent’s note</strong>{page.parentNote}</p>}
                  </article>
                ))}
              </div>
            )}
            {request.error && <GenerationError message={request.error} retry={retry} />}
            <nav>
              <button className="secondary" disabled={request.loading} onClick={() => setStep(10)}>Back</button>
              <button className="primary" onClick={saveFinishedDraft} disabled={request.loading || bookPages.some((page) => !page.approvedText?.trim())}>Save finished draft</button>
            </nav>
          </>
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

const sharedTranslationLoadingMessages = [
  "Trying several Slovenian versions…",
  "Listening to each version aloud…",
  "Checking the meaning against the page…",
  "Finding a more natural rhythm…",
  "Making the Slovenian feel effortless…",
  "Comparing the strongest drafts…",
  "Keeping the picture details intact…",
  "Polishing the most promising version…",
  "Making sure the narrator sounds consistent…",
  "Trying a different line shape…",
  "Checking that nothing feels forced…",
  "Keeping the language clear for children…",
  "Testing the cadence one more time…",
  "Looking for the warmest natural phrasing…",
  "Giving the strongest choices a final read…",
  "Preparing three choices for you…"
];

const proseTranslationLoadingMessages = [
  "Following the story from one moment to the next…",
  "Keeping the storytelling warm and clear…",
  "Checking that every picture detail still belongs…",
  ...sharedTranslationLoadingMessages
];

const continuousVerseLoadingMessages = [
  "Listening for the poem’s natural movement…",
  "Checking the line breaks aloud…",
  "Preserving the source’s own sound pattern…",
  ...sharedTranslationLoadingMessages
];

const refrainTranslationLoadingMessages = [
  "Trying another rhyme structure…",
  "Keeping the approved refrain exact…",
  "Checking every ending aloud…",
  "Making the rhyme work in real speech…",
  ...sharedTranslationLoadingMessages
];

function translationLoadingMessagesFor(bookForm: BookForm) {
  if (bookForm === "prose_story") return proseTranslationLoadingMessages;
  if (bookForm === "continuous_verse") return continuousVerseLoadingMessages;
  return refrainTranslationLoadingMessages;
}

const patternLoadingMessages = [
  "Carrying your approved voice forward…",
  "Testing the refrain on the next page…",
  "Keeping the rhythm consistent…",
  "Applying your edits to the next choices…",
  "Checking both pages side by side…",
  "Making sure the voice travels naturally…",
  ...refrainTranslationLoadingMessages
];

const sharedFullBookLoadingMessages = [
  "Reading the remaining pages…",
  "Following the story from beginning to end…",
  "Carrying your approved voice through the book…",
  "Keeping repeated language consistent…",
  "Checking the full story arc…",
  "Making each page sound like the same book…",
  "Checking every page against its picture…",
  "Polishing the book as one continuous read…",
  "Making sure no page was skipped…",
  "Preparing the finished translation for your email…"
];

function fullBookLoadingMessagesFor(bookForm: BookForm) {
  const formSpecific = bookForm === "prose_story"
    ? proseTranslationLoadingMessages
    : bookForm === "continuous_verse"
      ? continuousVerseLoadingMessages
      : [
          "Applying your rhyme feedback everywhere…",
          "Listening for repeated rhyme problems…",
          ...refrainTranslationLoadingMessages
        ];
  return [...sharedFullBookLoadingMessages, ...formSpecific];
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
          <p>We’re checking this carefully—it can take a little longer.</p>
        </div>
      )}
    </div>
  );
}

function VoiceBrief({
  bookForm,
  direction,
  priority,
  freedom
}: {
  bookForm: BookForm;
  direction: Direction | null;
  priority: string;
  freedom: string;
}) {
  const priorityLabel = prioritiesFor(bookForm).find(([value]) => value === priority)?.[1];
  const freedomLabel = freedoms.find(([value]) => value === freedom)?.[1];
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
  onExpand
}: {
  spread: Spread;
  number: number;
  onExpand: (image: { src: string; alt: string }) => void;
}) {
  return (
    <article className="source-card">
      <button className="zoomable-image-button" type="button" aria-label={`Open Page ${number} photo at full size`} onClick={() => onExpand({ src: spread.preview, alt: `Page ${number}` })}>
        <img src={spread.preview} alt="" />
      </button>
      <div><span>English source · Page {number}</span><p>{spread.text}</p></div>
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
