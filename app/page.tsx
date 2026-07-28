"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";

type Spread = {
  file: File;
  preview: string;
  text: string;
  uncertainty: string | null;
  status: "waiting" | "reading" | "done" | "error";
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

export default function Home() {
  const [step, setStep] = useState(1);
  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [priority, setPriority] = useState("");
  const [freedom, setFreedom] = useState("");

  const progress = useMemo(() => `${Math.min(step, 4)} of 4`, [step]);

  async function readSpread(index: number, image: string) {
    setSpreads((current) => current.map((spread, i) =>
      i === index ? { ...spread, status: "reading" } : spread
    ));
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSpreads((current) => current.map((spread, i) =>
        i === index
          ? { ...spread, text: result.text, uncertainty: result.uncertainty, status: "done" }
          : spread
      ));
    } catch {
      setSpreads((current) => current.map((spread, i) =>
        i === index ? { ...spread, status: "error" } : spread
      ));
    }
  }

  async function addFile(file?: File) {
    if (!file || !file.type.startsWith("image/") || spreads.length >= 3) return;
    const preview = await fileToDataUrl(file);
    const index = spreads.length;
    setSpreads((current) => [...current, {
      file, preview, text: "", uncertainty: null, status: "waiting"
    }]);
    void readSpread(index, preview);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    void addFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void addFile(event.dataTransfer.files?.[0]);
  }

  return (
    <main>
      <header>
        <a className="brand" href="#" onClick={() => setStep(1)}>bibaling</a>
        <div className="progress"><span>{progress}</span><i><b style={{ width: `${step * 25}%` }} /></i></div>
      </header>

      <section className="workshop">
        {step === 1 && (
          <>
            <p className="kicker">Book workshop</p>
            <h1>Add the first three spreads.</h1>
            <p className="lead">We’ll use them to find a Slovenian voice that feels right before working through the whole book.</p>
            <div className="uploads">
              {spreads.map((spread, index) => (
                <label className="photo" key={spread.preview}>
                  <img src={spread.preview} alt={`Book spread ${index + 1}`} />
                  <input type="file" accept="image/*" onChange={chooseFile} />
                  <span>Replace</span>
                </label>
              ))}
              {spreads.length < 3 && (
                <label className="drop" onDrop={drop} onDragOver={(e) => e.preventDefault()}>
                  <input type="file" accept="image/*" onChange={chooseFile} />
                  <strong>+</strong>
                  <span>{spreads.length ? "Add another spread" : "Drop a book photo here"}</span>
                  <small>or click to choose one</small>
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
                <article className="transcription" key={spread.preview}>
                  <img src={spread.preview} alt="" />
                  <div>
                    <label htmlFor={`text-${index}`}>Spread {index + 1}</label>
                    <textarea
                      id={`text-${index}`}
                      value={spread.text}
                      placeholder={spread.status === "reading" ? "Reading the spread…" : "Type or paste the English text here"}
                      onChange={(e) => setSpreads((current) => current.map((item, i) =>
                        i === index ? { ...item, text: e.target.value } : item
                      ))}
                    />
                    {spread.status === "error" && <p className="note">I couldn’t read this one reliably. Please type the words—the photo is still safe here.</p>}
                    {spread.uncertainty && <p className="note">{spread.uncertainty}</p>}
                  </div>
                </article>
              ))}
            </div>
            <nav><button className="secondary" onClick={() => setStep(1)}>Back</button><button className="primary" disabled={spreads.some((s) => !s.text.trim())} onClick={() => setStep(3)}>Looks right</button></nav>
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
            <nav><button className="secondary" onClick={() => setStep(3)}>Back</button><button className="primary" disabled={!freedom} onClick={() => alert("Next: the Refrain Lab. This first PR stops here so we can review the real foundation before adding literary generation.")}>Find our book’s voice</button></nav>
          </>
        )}
      </section>
    </main>
  );
}
