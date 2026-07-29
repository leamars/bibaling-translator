"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

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
  keeps: string;
  changes: string;
  genderDependency: string;
  modelLabel: string;
};

type GeneratedOption = { strategy: string; text: string };
type TranslationOption = GeneratedOption & {
  modelLabel: string;
  originalText: string;
  editNote: string;
};
type RequestState = { loading: boolean; error: string | null };
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
};

const priorities = [
  ["rhythm", "Rhyme and read-aloud rhythm", "Make it musical and satisfying to say."],
  ["meaning", "Meaning and picture details", "Keep the joke, emotional beat, and what the child sees."],
  ["simple", "Simple language", "Use words that are easy for a young child to follow."]
] as const;

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

function mockPreview(number: number) {
  const colors = ["#dcebe4", "#f2dfb7", "#d9e4f2", "#ead8d1", "#dce4bd", "#e4d8ef"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${colors[(number - 1) % colors.length]}"/><circle cx="400" cy="260" r="120" fill="#fff" opacity=".75"/><text x="400" y="285" text-anchor="middle" font-family="Georgia" font-size="54" fill="#245747">Mock page ${number}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [priority, setPriority] = useState("");
  const [freedom, setFreedom] = useState("");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<number | null>(null);
  const [directionFeedback, setDirectionFeedback] = useState("");
  const [shownRefrains, setShownRefrains] = useState<string[]>([]);
  const [lockedDirection, setLockedDirection] = useState<Direction | null>(null);
  const [spread1Options, setSpread1Options] = useState<TranslationOption[]>([]);
  const [spread1Selection, setSpread1Selection] = useState<number | null>(null);
  const [approvedSpread1, setApprovedSpread1] = useState("");
  const [patternOptions, setPatternOptions] = useState<Record<number, TranslationOption[]>>({});
  const [patternSelections, setPatternSelections] = useState<Record<number, number | null>>({ 2: null, 3: null });
  const [approvedDrafts, setApprovedDrafts] = useState<Record<number, string>>({});
  const [approvedNotes, setApprovedNotes] = useState<Record<number, string>>({});
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [request, setRequest] = useState<RequestState>({ loading: false, error: null });
  const [directionProgress, setDirectionProgress] = useState<DirectionProgress>({ active: 0, completedThrough: -1, rejectedCount: 0 });
  const [bookPages, setBookPages] = useState<BookPage[]>([]);
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [bookOrderLocked, setBookOrderLocked] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const directionsAbort = useRef<AbortController | null>(null);
  const translationAbort = useRef<AbortController | null>(null);
  const fullBookAbort = useRef<AbortController | null>(null);

  const progress = useMemo(() => `${step} of 10`, [step]);

  useEffect(() => {
    setMockMode(document.cookie.split(";").some((part) => part.trim() === "bibaling_mock_mode=true"));
  }, []);

  function toggleMockMode() {
    setMockMode((current) => {
      const next = !current;
      document.cookie = `bibaling_mock_mode=${next}; path=/; SameSite=Lax`;
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
      text,
      uncertainty: null,
      visualContext: "A mock picture-book page.",
      error: null,
      status: "done" as const
    })));
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
      if (!result) throw new Error("I couldn’t read this page.");
      setSpreads((current) => current.map((spread) =>
        spread.id === id
          ? { ...spread, text: result.text, uncertainty: result.uncertainty, visualContext: result.visualContext, error: null, status: "done" }
          : spread
      ));
    } catch (error) {
      setSpreads((current) => current.map((spread) =>
        spread.id === id
          ? { ...spread, error: error instanceof Error ? error.message : "I couldn’t read this page.", status: "error" }
          : spread
      ));
    }
  }

  async function addFile(file?: File, replaceId?: string) {
    if (!file || !file.type.startsWith("image/") || (!replaceId && spreads.length >= 3)) return;
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
    const available = Math.max(0, 3 - spreads.length);
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
    setSpreads((current) => [...current, ...additions].slice(0, 3));
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

  async function generateDirections() {
    if (directionsAbort.current) return;
    const controller = new AbortController();
    directionsAbort.current = controller;
    setStep(5);
    setRequest({ loading: true, error: null });
    setDirectionProgress({ active: 0, completedThrough: -1, rejectedCount: 0 });
    try {
      const response = await fetch("/api/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        signal: controller.signal,
        body: JSON.stringify({
          visualContexts: spreads.map((spread) => spread.visualContext),
          texts: spreads.map((spread) => spread.text),
          priority,
          freedom,
          parentFeedback: directionFeedback.trim() || undefined,
          previousRefrains: shownRefrains
        })
      });
      if (!response.ok || !response.body) throw new Error("I couldn’t start the literary workshop.");
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
            error?: string;
            data?: DirectionStreamResult;
          };
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "cancelled") throw new DOMException(event.error || "Cancelled", "AbortError");
          if (event.type === "result") result = event.data || null;
          if (event.type === "progress") {
            if (event.event === "generation.started" || event.event === "request.accepted") {
              setDirectionProgress((current) => ({ ...current, active: 2, completedThrough: 1 }));
            } else if (event.event === "generation.completed") {
              setDirectionProgress((current) => ({ ...current, active: 3, completedThrough: 2 }));
            } else if (event.event === "filtering.started") {
              setDirectionProgress((current) => ({ ...current, active: 4, completedThrough: 3 }));
            } else if (event.event === "filtering.completed") {
              setDirectionProgress((current) => ({ ...current, active: 5, completedThrough: 4, rejectedCount: event.rejectedCount || 0 }));
            } else if (event.event === "evaluation.started") {
              setDirectionProgress((current) => ({ ...current, active: 5, completedThrough: 4 }));
            } else if (event.event === "evaluation.completed") {
              setDirectionProgress((current) => ({ ...current, active: 6, completedThrough: 5 }));
            } else if (event.event === "rejection.completed") {
              setDirectionProgress({ active: 6, completedThrough: 5, rejectedCount: event.rejectedCount || 0 });
            } else if (event.event === "selection.completed") {
              setDirectionProgress((current) => ({ ...current, active: 6, completedThrough: 6 }));
            }
          }
        }
      }
      if (!result) throw new Error("I couldn’t finish those literary options. Your choices and edits are still here—please try again.");
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
        setRequest({ loading: false, error: error instanceof Error ? error.message : "I couldn’t write the directions." });
      }
    } finally {
      if (directionsAbort.current === controller) directionsAbort.current = null;
    }
  }

  function cancelDirections(goBack = false) {
    directionsAbort.current?.abort();
    directionsAbort.current = null;
    setRequest({ loading: false, error: null });
    if (goBack) setStep(4);
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

  async function lockDirectionAndWriteSpread1() {
    if (selectedDirection === null) return;
    const controller = new AbortController();
    translationAbort.current = controller;
    const direction = { ...directions[selectedDirection] };
    setLockedDirection(direction);
    setStep(6);
    setRequest({ loading: true, error: null });
    try {
      const result = await postJson<{ runs: Array<{ label: string; options: GeneratedOption[] }> }>("/api/translations", {
        mode: "spread1",
        visualContext: spreads[0].visualContext,
        source: spreads[0].text,
        priority,
        freedom,
        direction
      }, controller.signal);
      setSpread1Options(result.runs.flatMap((run) =>
        run.options.map((option) => ({
          ...option,
          modelLabel: run.label,
          originalText: option.text,
          editNote: ""
        }))
      ));
      setSpread1Selection(null);
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setRequest({ loading: false, error: error instanceof Error ? error.message : "I couldn’t write Page 1." });
      }
    } finally {
      if (translationAbort.current === controller) translationAbort.current = null;
    }
  }

  function updateSpread1Option(index: number, text: string) {
    setSpread1Options((current) => current.map((option, i) => i === index ? { ...option, text } : option));
  }

  function updateSpread1Note(index: number, editNote: string) {
    setSpread1Options((current) => current.map((option, i) => i === index ? { ...option, editNote } : option));
  }

  async function approveSpread1AndPatternTest() {
    if (spread1Selection === null || !lockedDirection) return;
    const controller = new AbortController();
    translationAbort.current = controller;
    const approved = spread1Options[spread1Selection].text.trim();
    const approvedNote = spread1Options[spread1Selection].editNote.trim();
    setApprovedSpread1(approved);
    setApprovedNotes((current) => ({ ...current, 1: approvedNote }));
    setStep(7);
    setRequest({ loading: true, error: null });
    try {
      const result = await postJson<{ runs: Array<{ label: string; spreads: Array<{ spread: number; options: GeneratedOption[] }> }> }>("/api/translations", {
        mode: "pattern",
        visualContexts: [spreads[1].visualContext, spreads[2].visualContext],
        sources: [spreads[1].text, spreads[2].text],
        priority,
        freedom,
        direction: lockedDirection,
        approvedSpread1: approved,
        approvedSpread1Note: approvedNote || undefined
      }, controller.signal);
      setPatternOptions(Object.fromEntries([2, 3].map((spreadNumber) => [
        spreadNumber,
        result.runs.flatMap((run) => {
          const spread = run.spreads.find((item) => item.spread === spreadNumber);
          return (spread?.options || []).map((option) => ({
            ...option,
            modelLabel: run.label,
            originalText: option.text,
            editNote: ""
          }));
        })
      ])));
      setPatternSelections({ 2: null, 3: null });
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setRequest({ loading: false, error: error instanceof Error ? error.message : "I couldn’t test the next pages." });
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
    setStep(8);
    setVoiceLocked(false);
  }

  function startRestOfBook() {
    const samples = spreads.map((spread, index) => ({
      id: spread.id,
      preview: spread.preview,
      fileName: spread.file.name,
      sourceText: spread.text,
      visualContext: spread.visualContext,
      approvedText: approvedDrafts[index + 1] || null,
      parentNote: approvedNotes[index + 1] || undefined,
      voiceSample: true
    }));
    const mockRemainder = mockMode ? [4, 5, 6].map((number) => ({
      id: crypto.randomUUID(),
      preview: mockPreview(number),
      fileName: `mock-page-${number}.png`,
      sourceText: `Mock English source for page ${number}. The friends continue their adventure.`,
      visualContext: "A mock picture-book page continuing the friends’ adventure.",
      approvedText: null,
      parentNote: undefined,
      voiceSample: false
    })) : [];
    setBookPages([...samples, ...mockRemainder]);
    setBookOrderLocked(false);
    setStep(9);
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
      voiceSample: false
    })));
    setBookPages((current) => [...current, ...additions]);
    setBookOrderLocked(false);
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
    setBookOrderLocked(false);
  }

  async function generateRestOfBook() {
    if (!lockedDirection || fullBookAbort.current) return;
    const controller = new AbortController();
    fullBookAbort.current = controller;
    setStep(10);
    setRequest({ loading: true, error: null });
    try {
      const withSources = await Promise.all(bookPages.map(async (page) => {
        if (page.sourceText.trim()) return page;
        const result = await postJson<{ text: string; visualContext: string }>("/api/transcribe", { image: page.preview }, controller.signal);
        return { ...page, sourceText: result.text, visualContext: result.visualContext };
      }));
      setBookPages(withSources);
      const remaining = withSources.flatMap((page, index) =>
        page.approvedText ? [] : [{
          spread: index + 1,
          visualContext: page.visualContext,
          source: page.sourceText
        }]
      );
      if (remaining.length === 0) {
        setRequest({ loading: false, error: null });
        return;
      }
      const result = await postJson<{ spreads: Array<{ spread: number; text: string }> }>("/api/translations", {
        mode: "fullbook",
        spreads: remaining,
        priority,
        freedom,
        direction: lockedDirection,
        approvedVoice: withSources.flatMap((page, index) =>
          page.approvedText ? [{
            spread: index + 1,
            text: page.approvedText,
            parentNote: page.parentNote || undefined
          }] : []
        )
      }, controller.signal);
      const translations = new Map(result.spreads.map((spread) => [spread.spread, spread.text]));
      setBookPages(withSources.map((page, index) => ({
        ...page,
        approvedText: page.approvedText || translations.get(index + 1) || null
      })));
      setRequest({ loading: false, error: null });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (fullBookAbort.current === controller) setRequest({ loading: false, error: null });
      } else {
        setRequest({
          loading: false,
          error: error instanceof Error ? error.message : "I couldn’t finish the full book. Everything approved so far is still here."
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

  const retry = step === 5
    ? generateDirections
    : step === 6
      ? lockDirectionAndWriteSpread1
      : step === 10
        ? generateRestOfBook
        : approveSpread1AndPatternTest;

  return (
    <main>
      <header>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setStep(1); }}>bibaling</a>
        <div className="header-tools">
          <button className={mockMode ? "mock-toggle active" : "mock-toggle"} type="button" onClick={toggleMockMode}>
            Mock mode {mockMode ? "on" : "off"}
          </button>
          <div className="progress"><span>{progress}</span><i><b style={{ width: `${step / 10 * 100}%` }} /></i></div>
        </div>
      </header>

      <section className="workshop">
        {step === 1 && (
          <>
            <p className="kicker">Book workshop</p>
            <h1>Add the first three book photos.</h1>
            <p className="lead">We’ll use them to find a Slovenian voice that feels right before working through the whole book.</p>
            <figure className="photo-guide">
              <img src="/photo-guide.png" alt="A phone photographing an entire open picture book, with both facing pages fully visible." />
              <figcaption>
                <strong>Photograph the whole open book</strong>
                <span>Keep both pages flat, fully in frame, and easy to read.</span>
              </figcaption>
            </figure>
            {mockMode && spreads.length === 0 && (
              <button className="secondary mock-load" type="button" onClick={loadMockBook}>Load a mock book</button>
            )}
            <div className="uploads">
              {spreads.map((spread, index) => (
                <label className="photo" key={spread.id}>
                  <img src={spread.preview} alt={`Book page ${index + 1}`} />
                  <input type="file" accept="image/*" onChange={(event) => chooseFile(event, spread.id)} />
                  <span>Replace</span>
                </label>
              ))}
              {spreads.length < 3 && (
                <label className="drop" onDrop={drop} onDragOver={(event) => event.preventDefault()}>
                  <input type="file" accept="image/*" multiple onChange={(event) => chooseFile(event)} />
                  <strong>+</strong>
                  <span>{spreads.length ? "Add the remaining pages" : "Drop three book photos here"}</span>
                  <small>or click to choose multiple images</small>
                </label>
              )}
            </div>
            <button className="primary" disabled={spreads.length !== 3} onClick={() => setStep(2)}>Continue</button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="kicker">Check the words</p>
            <h1>Did I read these correctly?</h1>
            <p className="lead">Fix anything I missed. Your wording here becomes the source for the Slovenian version.</p>
            <div className="transcriptions">
              {spreads.map((spread, index) => (
                <article className={spread.status === "reading" ? "transcription is-reading" : "transcription"} key={spread.id} aria-busy={spread.status === "reading"}>
                  <img src={spread.preview} alt="" />
                  <div>
                    <label htmlFor={`text-${index}`}>Page {index + 1}</label>
                    {spread.status === "reading" && (
                      <div className="reading-state" role="status">
                        <RotatingThinkingLine messages={readingLoadingMessages} />
                      </div>
                    )}
                    <textarea
                      id={`text-${index}`}
                      value={spread.text}
                      placeholder={spread.status === "reading" ? "Reading the page…" : "Type or paste the English text here"}
                      disabled={spread.status === "reading"}
                      onChange={(event) => setSpreads((current) => current.map((item, i) =>
                        i === index ? { ...item, text: event.target.value } : item
                      ))}
                    />
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
              <button className="primary" disabled={spreads.some((spread) => !spread.text.trim())} onClick={() => setStep(3)}>Looks right</button>
            </nav>
          </>
        )}

        {step === 3 && (
          <>
            <p className="kicker">Your taste</p>
            <h1>What matters most for this book?</h1>
            <p className="lead">We’ll balance all three. Choose the one you’d least want us to compromise.</p>
            <div className="choices">
              {priorities.map(([value, title, description]) => (
                <button className={priority === value ? "choice selected" : "choice"} onClick={() => setPriority(value)} key={value}>
                  <span className="radio" /><span><strong>{title}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
            <nav><button className="secondary" onClick={() => setStep(2)}>Back</button><button className="primary" disabled={!priority} onClick={() => setStep(4)}>Continue</button></nav>
          </>
        )}

        {step === 4 && (
          <>
            <p className="kicker">Creative freedom</p>
            <h1>How freely should we adapt it?</h1>
            <p className="lead">There’s no “correct” answer. Choose how you want this family version to feel.</p>
            <div className="choices">
              {freedoms.map(([value, title, description]) => (
                <button className={freedom === value ? "choice selected" : "choice"} onClick={() => setFreedom(value)} key={value}>
                  <span className="radio" /><span><strong>{title}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
            <nav><button className="secondary" onClick={() => setStep(3)}>Back</button><button className="primary" disabled={!freedom} onClick={() => void generateDirections()}>Find our book’s voice</button></nav>
          </>
        )}

        {step === 5 && (
          <>
            <p className="kicker">Refrain lab</p>
            <h1>Three ways the whole book could sound.</h1>
            <p className="lead">Choose one quality-checked direction, then make its wording yours. We’ll lock exactly what you approve.</p>
            {request.loading && <ProgressLog messages={directionLoadingMessages} progress={directionProgress} onRestart={restartDirections} />}
            {!request.loading && directions.length > 0 && (
              <div className="direction-grid">
                {directions.map((direction, index) => {
                  const selected = selectedDirection === index;
                  return (
                    <article className={selected ? "direction-card selected-card" : "direction-card"} key={`${direction.name}-${index}`} onClick={() => setSelectedDirection(index)}>
                      {selected ? (
                        <label>Make this refrain yours<textarea value={direction.refrain} onChange={(event) => updateDirection(index, "refrain", event.target.value)} /></label>
                      ) : (
                        <><p className="strategy">Option {(index % 3) + 1}</p><blockquote>{direction.refrain}</blockquote></>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {!request.loading && directions.length > 0 && (
              <div className="reroll-directions">
                <label>
                  Want something different?
                  <textarea
                    value={directionFeedback}
                    onChange={(event) => setDirectionFeedback(event.target.value)}
                    placeholder="Add a note about what you’d prefer (optional)"
                  />
                </label>
                <button className="secondary" type="button" onClick={() => void generateDirections()}>
                  Try three different ones
                </button>
              </div>
            )}
            {request.error && <GenerationError message={request.error} retry={retry} />}
            <nav><button className="secondary" onClick={() => request.loading ? cancelDirections(true) : setStep(4)}>Back</button><button className="primary" disabled={request.loading || selectedDirection === null || !directions[selectedDirection]?.refrain.trim()} onClick={() => void lockDirectionAndWriteSpread1()}>Lock this direction</button></nav>
          </>
        )}

        {step === 6 && lockedDirection && (
          <>
            <p className="kicker">Page 1 workshop</p>
            <h1>Let’s test the voice on one page.</h1>
            <p className="lead">Choose from three Slovenian possibilities that have each passed the locked brief.</p>
            <LockedBrief direction={lockedDirection} priority={priority} />
            <Source spread={spreads[0]} number={1} />
            {request.loading && <ProgressLog messages={translationLoadingMessages} onRestart={() => restartTranslation(lockDirectionAndWriteSpread1)} />}
            {!request.loading && <OptionList options={spread1Options} selection={spread1Selection} onSelect={setSpread1Selection} onEdit={updateSpread1Option} onNote={updateSpread1Note} />}
            {request.error && <GenerationError message={request.error} retry={retry} />}
            <nav>
              <button className="secondary" disabled={request.loading} onClick={() => setStep(5)}>Rework direction</button>
              <button className="primary" disabled={request.loading || spread1Selection === null || !spread1Options[spread1Selection]?.text.trim()} onClick={() => void approveSpread1AndPatternTest()}>Approve and test the pattern</button>
            </nav>
          </>
        )}

        {step === 7 && lockedDirection && (
          <>
            <p className="kicker">Pattern test</p>
            <h1>Does the voice travel?</h1>
            <p className="lead">Choose and edit one option for each page. Page 1 stays beside us as the voice reference.</p>
            <LockedBrief direction={lockedDirection} priority={priority} />
            <article className="approved-card voice-reference">
              <img src={spreads[0].preview} alt="Approved Page 1" />
              <label>Approved Page 1 · voice reference</label>
              <p>{approvedSpread1}</p>
              {approvedNotes[1] && <p className="parent-edit-note"><strong>Parent’s note</strong>{approvedNotes[1]}</p>}
            </article>
            {request.loading && <ProgressLog messages={patternLoadingMessages} onRestart={() => restartTranslation(approveSpread1AndPatternTest)} />}
            {!request.loading && [2, 3].map((number) => (
              <section className="pattern-section" key={number}>
                <Source spread={spreads[number - 1]} number={number} />
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
            <nav><button className="secondary" disabled={request.loading} onClick={() => setStep(6)}>Back to Page 1</button><button className="primary" disabled={request.loading || patternSelections[2] === null || patternSelections[3] === null} onClick={approvePattern}>Review all three</button></nav>
          </>
        )}

        {step === 8 && lockedDirection && (
          <>
            <p className="kicker">Voice review</p>
            <h1>{voiceLocked ? "The voice is locked." : "Do these belong in the same book?"}</h1>
            <p className="lead">{voiceLocked ? "These three approved pages are now the voice reference for the rest of the book." : "Read them aloud together. You can still tune any line before confirming."}</p>
            <LockedBrief direction={lockedDirection} priority={priority} />
            <div className="approved-grid">
              {[1, 2, 3].map((number) => (
                <article className="approved-card" key={number}>
                  <img src={spreads[number - 1].preview} alt={`Page ${number}`} />
                  <label>Page {number}</label>
                  <textarea disabled={voiceLocked} value={approvedDrafts[number] || ""} onChange={(event) => setApprovedDrafts((current) => ({ ...current, [number]: event.target.value }))} />
                  {approvedNotes[number] && <p className="parent-edit-note"><strong>Parent’s note</strong>{approvedNotes[number]}</p>}
                </article>
              ))}
            </div>
            {!voiceLocked ? (
              <nav><button className="secondary" onClick={() => setStep(7)}>Rework the pattern</button><button className="primary" disabled={[1, 2, 3].some((number) => !approvedDrafts[number]?.trim())} onClick={() => setVoiceLocked(true)}>Yes, the voice feels consistent</button></nav>
            ) : (
              <>
                <div className="locked-confirmation"><span>Locked by parent</span><p>The exact refrain and these approved drafts will guide every later page.</p></div>
                <button className="primary" onClick={startRestOfBook}>Add the rest of the book</button>
              </>
            )}
          </>
        )}

        {step === 9 && (
          <>
            <p className="kicker">The rest of the book</p>
            <h1>Now put the whole book in order.</h1>
            <p className="lead">Drop all the remaining book photos at once. Then drag every card—including the first three—until the sequence matches the physical book.</p>
            <label
              className="rest-drop"
              onDrop={(event) => { event.preventDefault(); void addRemainingFiles(event.dataTransfer.files); }}
              onDragOver={(event) => event.preventDefault()}
            >
              <input type="file" accept="image/*" multiple onChange={(event) => { void addRemainingFiles(event.target.files ?? undefined); event.target.value = ""; }} />
              <strong>+</strong>
              <span>Drop all remaining book photos here</span>
              <small>or click to choose multiple images</small>
            </label>

            <div className="order-heading">
              <div><strong>Book order</strong><small>{bookPages.length} pages · drag to rearrange</small></div>
              {bookOrderLocked && <span>Order confirmed</span>}
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
              <button className="secondary" onClick={() => setStep(8)}>Back to voice</button>
              <button className="primary" disabled={bookPages.length < 3 || bookOrderLocked} onClick={() => setBookOrderLocked(true)}>
                {bookOrderLocked ? "Order confirmed" : "This order is right"}
              </button>
            </nav>
            {bookOrderLocked && <div className="locked-confirmation"><span>Ready for the next stage</span><p>The full book order is saved in this session. Next, Bibaling can read and workshop the remaining pages one at a time.</p></div>}
            {bookOrderLocked && (
              <button className="primary continue-full-book" type="button" onClick={() => void generateRestOfBook()}>
                Translate the full book
              </button>
            )}
          </>
        )}

        {step === 10 && lockedDirection && (
          <>
            <p className="kicker">Full book</p>
            <h1>{request.loading ? "Writing the rest of your book." : "Your full Slovenian draft."}</h1>
            <p className="lead">
              {request.loading
                ? "We’re reading the remaining pages and carrying your approved voice and corrections through the whole story."
                : "Read through every page in order. You can edit any line before saving the finished draft."}
            </p>
            <LockedBrief direction={lockedDirection} priority={priority} />
            {request.loading && <ProgressLog messages={fullBookLoadingMessages} onRestart={restartFullBook} />}
            {!request.loading && (
              <div className="full-book-draft">
                {bookPages.map((page, index) => (
                  <article className="approved-card" key={page.id}>
                    <img src={page.preview} alt={`Page ${index + 1}`} />
                    <label>Page {index + 1}{page.voiceSample ? " · parent-approved reference" : ""}</label>
                    <textarea
                      value={page.approvedText || ""}
                      onChange={(event) => updateBookTranslation(index, event.target.value)}
                    />
                    {page.parentNote && <p className="parent-edit-note"><strong>Parent’s note</strong>{page.parentNote}</p>}
                  </article>
                ))}
              </div>
            )}
            {request.error && <GenerationError message={request.error} retry={retry} />}
            <nav>
              <button className="secondary" disabled={request.loading} onClick={() => setStep(9)}>Back to book order</button>
              <button className="primary" onClick={saveFinishedDraft} disabled={request.loading || bookPages.some((page) => !page.approvedText?.trim())}>Save finished draft</button>
            </nav>
          </>
        )}
      </section>
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
      <span aria-hidden="true"><i /><i /><i /></span>
      <b>{message}</b>
    </div>
  );
}

const directionMilestones = [
  "Reading the complete book",
  "Finding the story arc and repeated language",
  "Drafting distinct literary directions",
  "Testing rhyme and read-aloud rhythm",
  "Checking fidelity and natural Slovenian",
  "Rejecting weak or forced candidates",
  "Selecting the three strongest directions"
];

function ProgressLog({
  messages,
  onRestart,
  progress
}: {
  messages: readonly string[];
  onRestart?: () => void;
  progress?: DirectionProgress;
}) {
  const [showReassurance, setShowReassurance] = useState(false);

  useEffect(() => {
    const reassurance = window.setTimeout(() => setShowReassurance(true), 25000);
    return () => window.clearTimeout(reassurance);
  }, []);

  return (
    <div className="direction-progress-log" aria-live="polite">
      {progress && (
        <ol className="progress-milestones">
          {directionMilestones.map((label, index) => (
            <li className={index <= progress.completedThrough ? "done" : index === progress.active ? "active" : ""} key={label}>
              <span aria-hidden="true">{index <= progress.completedThrough ? "✓" : index === progress.active ? "●" : "○"}</span>
              {label}
            </li>
          ))}
        </ol>
      )}
      <RotatingThinkingLine messages={messages} />
      <div className="progress-log-footer">
        <p>{showReassurance ? "Good verse takes a little longer—we’re checking this carefully." : "We’re checking this carefully."}</p>
        {onRestart && <button type="button" onClick={onRestart}>Restart</button>}
      </div>
    </div>
  );
}

function LockedBrief({ direction, priority }: { direction: Direction; priority: string }) {
  return (
    <aside className="locked-brief">
      <span>Locked by parent</span>
      <strong>{direction.name}</strong>
      <blockquote>{direction.refrain}</blockquote>
      <small>{direction.modelLabel} · Most important: {priorities.find(([value]) => value === priority)?.[1]}</small>
    </aside>
  );
}

function Source({ spread, number }: { spread: Spread; number: number }) {
  return (
    <article className="source-card">
      <img src={spread.preview} alt={`Page ${number}`} />
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
  onSelect: (index: number) => void;
  onEdit: (index: number, text: string) => void;
  onNote: (index: number, note: string) => void;
}) {
  return (
    <div className="option-grid">
      {options.map((option, index) => (
        <article className={selection === index ? "option-card selected-card" : "option-card"} key={`${option.strategy}-${index}`} onClick={() => onSelect(index)}>
          <p className="strategy">{option.modelLabel} · {option.strategy}</p>
          {selection === index ? (
            <>
              <textarea aria-label={`Edit ${option.strategy}`} value={option.text} onChange={(event) => onEdit(index, event.target.value)} />
              {option.text.trim() !== option.originalText.trim() && (
                <label className="edit-feedback">
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
          <button type="button" className="select-option" onClick={() => onSelect(index)}>{selection === index ? "Selected · edit above" : "Choose"}</button>
        </article>
      ))}
    </div>
  );
}

function GenerationError({ message, retry }: { message: string; retry: () => void | Promise<void> }) {
  return (
    <div className="generation-error"><strong>That draft didn’t finish.</strong><p>{message}</p><button type="button" onClick={() => void retry()}>Try again</button></div>
  );
}
