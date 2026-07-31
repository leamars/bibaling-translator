import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

type ReviewBundle = {
  generatedAt: string;
  targetLanguage: string;
  regionalVariant: string;
  refrainSetup: {
    englishSources: string[];
    rawDraftOptions: Array<{ name: string; refrain: string; approach: string }>;
    editorialOptions: Array<{
      sourceCandidateIndex: number;
      label: string;
      refrain: string;
      description: string;
      construction: string;
      rhymePairs: Array<{ endingA: string; endingB: string }>;
      rank?: number;
      recommendedFinalist?: boolean;
      strengths?: string[];
      weaknesses?: string[];
      comparativeAssessment?: Record<string, string>;
      rhymeAssessment?: unknown;
    }>;
    selectedDirection: { refrain: string };
  };
  fixtures: Array<{
    fixtureId: string;
    category: string;
    sourceBook: string;
    sourceAsset: string;
    englishSource: string;
    visualContext: string;
    bookForm: string;
    sourceRhyme: string;
    requirements: string[];
    draftOptions: Array<{ id: string; strategy: string; text: string }>;
    editorialAssessment: Array<{
      sourceCandidateId: string;
      strategy: string;
      text: string;
      fidelityPass: boolean;
      grammarPass: boolean;
      readAloudPass: boolean;
      directionPass: boolean;
      rhymePass: boolean;
      rank?: number;
      recommendedFinalist?: boolean;
      strengths?: string[];
      weaknesses?: string[];
      comparativeAssessment?: Record<string, string>;
      rhymeAssessment?: unknown;
    }>;
    finalSelectedOutput: string;
  }>;
};

type HumanFindings = Record<string, unknown>;

const artifactDirectory = resolve(
  process.argv[2] || "artifacts/spanish-evaluation-1785444427987"
);
const outputPath = resolve(
  process.argv[3] || `${artifactDirectory}/spanish-blind-review.html`
);

function mimeType(path: string) {
  const extension = extname(path).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

async function imageDataUrl(path: string) {
  const bytes = await readFile(path);
  return `data:${mimeType(path)};base64,${bytes.toString("base64")}`;
}

async function resolveSourceImage(sourceBook: string, sourceAsset: string) {
  const folder = sourceBook === "I Love You So Mush"
    ? "/Users/leamarolt/Downloads/I love you so mush"
    : "/Users/leamarolt/Downloads/Llama Llama";
  try {
    return await imageDataUrl(resolve(folder, sourceAsset));
  } catch {
    return null;
  }
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function counterbalancedOrder(length: number, itemIndex: number) {
  const base = Array.from({ length }, (_, index) => index);
  const rotation = itemIndex % length;
  const rotated = [...base.slice(rotation), ...base.slice(0, rotation)];
  return itemIndex % 2 === 0 ? rotated : rotated.reverse();
}

async function buildDataset(bundle: ReviewBundle, humanFindings: HumanFindings) {
  const fixtureImages = await Promise.all(
    bundle.fixtures.map((fixture) =>
      resolveSourceImage(fixture.sourceBook, fixture.sourceAsset)
    )
  );
  const refrainImages = fixtureImages.slice(0, 3).filter(Boolean);
  const refrainCandidates = bundle.refrainSetup.editorialOptions.map((option, index) => ({
    id: `refrain-finalist-${index + 1}`,
    text: option.refrain,
    originalOrder: index + 1,
    identity: option.label,
    construction: option.construction,
    previousModelSelected:
      option.refrain === bundle.refrainSetup.selectedDirection.refrain,
    currentModelSelected: option.recommendedFinalist === true,
    rank: option.rank ?? null,
    strengths: option.strengths ?? [],
    weaknesses: option.weaknesses ?? [],
    comparativeAssessment: option.comparativeAssessment ?? null,
    rhymeAssessment: option.rhymeAssessment ?? {
      required: true,
      evidence: option.rhymePairs.map((pair) => ({
        anchorA: pair.endingA,
        anchorB: pair.endingB,
        classification: "legacy_unclassified"
      }))
    }
  }));
  const items: Array<Record<string, any>> = [{
    id: "refrain-lab",
    title: "Recurring refrain",
    sourceBook: "I Love You So Mush",
    englishSource: bundle.refrainSetup.englishSources.join("\n\n—\n\n"),
    visualContext: "Three source spreads establish the recurring declaration and mushroom wordplay.",
    bookForm: "refrain_verse",
    testingContext: [
      "Affectionate recurring line",
      "Natural Spanish wordplay",
      "Memorable spoken rhyme"
    ],
    images: refrainImages,
    candidates: refrainCandidates,
    privateDrafts: bundle.refrainSetup.rawDraftOptions.map((draft, index) => ({
      id: `refrain-draft-${index + 1}`,
      strategy: `${draft.name} — ${draft.approach}`,
      text: draft.refrain
    })),
    previousModelSelection: bundle.refrainSetup.selectedDirection.refrain,
    currentModelSelection: refrainCandidates.find((candidate) => candidate.currentModelSelected)?.text ?? null,
    priorHumanFinding: humanFindings["refrain-lab"] ?? null
  }];

  bundle.fixtures.forEach((fixture, fixtureIndex) => {
    const candidates = fixture.editorialAssessment.map((candidate, index) => ({
      id: candidate.sourceCandidateId,
      text: candidate.text,
      originalOrder: index + 1,
      identity: candidate.strategy,
      construction: null,
      previousModelSelected: candidate.text === fixture.finalSelectedOutput,
      currentModelSelected: candidate.recommendedFinalist === true,
      rank: candidate.rank ?? null,
      strengths: candidate.strengths ?? [],
      weaknesses: candidate.weaknesses ?? [],
      comparativeAssessment: candidate.comparativeAssessment ?? null,
      rhymeAssessment: candidate.rhymeAssessment ?? null,
      eligibility: {
        fidelityPass: candidate.fidelityPass,
        grammarPass: candidate.grammarPass,
        readAloudPass: candidate.readAloudPass,
        directionPass: candidate.directionPass,
        rhymePass: candidate.rhymePass
      }
    }));
    items.push({
      id: fixture.fixtureId,
      title: fixture.category,
      sourceBook: fixture.sourceBook,
      englishSource: fixture.englishSource,
      visualContext: fixture.visualContext,
      bookForm: fixture.bookForm,
      testingContext: fixture.requirements,
      images: fixtureImages[fixtureIndex] ? [fixtureImages[fixtureIndex]] : [],
      candidates,
      privateDrafts: fixture.draftOptions,
      previousModelSelection: fixture.finalSelectedOutput,
      currentModelSelection:
        candidates.find((candidate) => candidate.currentModelSelected)?.text ?? null,
      priorHumanFinding: humanFindings[fixture.fixtureId] ?? null
    });
  });

  return {
    evaluationId: `spanish-human-review-${bundle.generatedAt}`,
    sourceRunId: bundle.generatedAt,
    language: bundle.targetLanguage,
    regionalVariant: bundle.regionalVariant,
    generatedAt: new Date().toISOString(),
    items: items.map((item, index) => ({
      ...item,
      presentationOrder: counterbalancedOrder(item.candidates.length, index)
        .map((candidateIndex) => item.candidates[candidateIndex].id)
    }))
  };
}

function page(dataset: unknown) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Bibaling blind Spanish review</title>
  <style>
    :root {
      --paper:#f6f0e5; --card:#fffdf8; --ink:#17213b; --green:#22594b;
      --mint:#e3efeb; --coral:#ef765f; --yellow:#f4c84a; --blue:#dce8f5;
      --line:#d9d1c4; --muted:#686a66; --danger:#9a3d2f;
      --shadow:0 18px 50px rgba(34,43,56,.10);
    }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:var(--paper);
      font:16px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    button,input,textarea { font:inherit; }
    button { cursor:pointer; }
    button:focus-visible,input:focus-visible,textarea:focus-visible {
      outline:3px solid var(--coral); outline-offset:3px;
    }
    .app { min-height:100vh; }
    header { position:sticky; top:0; z-index:20; display:flex; align-items:center;
      justify-content:space-between; gap:18px; padding:15px clamp(18px,4vw,52px);
      border-bottom:1px solid var(--line); background:rgba(246,240,229,.96); backdrop-filter:blur(12px); }
    .brand { font:700 25px/1 Georgia,serif; color:var(--green); }
    .progress-wrap { min-width:180px; flex:0 1 440px; }
    .progress-label { display:flex; justify-content:space-between; color:var(--muted); font-size:12px; }
    .progress-bar { height:6px; margin-top:6px; overflow:hidden; border-radius:999px; background:#e5ded2; }
    .progress-bar span { display:block; height:100%; background:var(--green); transition:width .25s ease; }
    .header-actions { display:flex; gap:8px; }
    .secondary,.primary,.quiet { border-radius:999px; padding:10px 15px; font-weight:750; }
    .secondary { border:1px solid var(--line); background:var(--card); color:var(--ink); }
    .primary { border:1px solid var(--green); background:var(--green); color:white; }
    .quiet { border:0; background:transparent; color:var(--green); text-decoration:underline; }
    main { width:min(1450px,100%); margin:auto; padding:28px clamp(18px,4vw,52px) 90px; }
    .orientation { display:flex; justify-content:space-between; gap:20px; align-items:end; margin-bottom:22px; }
    .eyebrow { color:var(--green); font-size:11px; font-weight:850; letter-spacing:.13em; text-transform:uppercase; }
    h1 { margin:5px 0 4px; font:700 clamp(32px,4vw,52px)/1 Georgia,serif; letter-spacing:-.035em; }
    .context { margin:0; color:var(--muted); }
    .item-controls { display:flex; gap:8px; }
    .workspace { display:grid; grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr); gap:22px; align-items:start; }
    .source-panel,.candidate-card,.summary-card,.reveal,.private-drafts,.winner-panel {
      border:1px solid var(--line); border-radius:24px; background:var(--card); box-shadow:var(--shadow);
    }
    .source-panel { position:sticky; top:92px; overflow:hidden; }
    .images { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; background:var(--line); }
    .images.single { grid-template-columns:1fr; }
    .images img { width:100%; height:220px; object-fit:contain; background:white; display:block; }
    .source-copy { padding:22px; }
    .source { margin:12px 0 0; white-space:pre-wrap; font-size:17px; line-height:1.55; }
    details.context-details { margin-top:18px; border-top:1px solid var(--line); padding-top:14px; }
    details summary { cursor:pointer; font-weight:750; color:var(--green); }
    .context-details ul { margin:10px 0 0; padding-left:20px; color:var(--muted); }
    .candidate-column { min-width:0; }
    .blind-label { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .blind-chip { border-radius:999px; padding:6px 10px; background:var(--yellow); font-size:12px; font-weight:850; }
    .candidate-card { padding:clamp(22px,4vw,38px); min-height:310px; display:flex; flex-direction:column; }
    .candidate-text { flex:1; display:flex; align-items:center; margin:12px 0 24px; white-space:pre-wrap;
      overflow-wrap:anywhere; color:var(--green); font:700 clamp(24px,3vw,37px)/1.35 Georgia,serif; }
    .candidate-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
    .candidate-pager { display:flex; gap:8px; }
    .dots { display:flex; gap:7px; align-items:center; }
    .dot { width:9px; height:9px; border:0; padding:0; border-radius:50%; background:#d8d0c3; }
    .dot.active { background:var(--green); transform:scale(1.25); }
    .form-card { margin-top:16px; padding:20px; border:1px solid var(--line); border-radius:20px; background:rgba(255,253,248,.72); }
    .form-card h2 { margin:0 0 14px; font:700 21px/1.2 Georgia,serif; }
    .ratings { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .rating { position:relative; }
    .rating input { position:absolute; opacity:0; pointer-events:none; }
    .rating label { min-height:72px; display:flex; align-items:center; justify-content:center; text-align:center;
      padding:10px; border:1px solid var(--line); border-radius:15px; background:var(--card); cursor:pointer; font-weight:700; }
    .rating input:checked + label { border-color:var(--green); background:var(--mint); box-shadow:inset 0 0 0 1px var(--green); }
    .rating input:focus-visible + label { outline:3px solid var(--coral); outline-offset:3px; }
    .reason-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 14px; margin-top:17px; }
    .check { display:flex; gap:8px; align-items:flex-start; color:#3d4454; font-size:14px; }
    .check input { margin-top:4px; accent-color:var(--green); }
    .field-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px; }
    label.field { display:grid; gap:6px; color:var(--muted); font-size:13px; font-weight:700; }
    textarea { width:100%; min-height:88px; resize:vertical; border:1px solid var(--line); border-radius:14px;
      padding:12px; background:var(--card); color:var(--ink); }
    .equivalent { margin-top:16px; padding-top:14px; border-top:1px solid var(--line); }
    .equivalent-list { display:flex; gap:12px; flex-wrap:wrap; margin-top:8px; }
    .reviewed { color:var(--green); font-weight:750; font-size:13px; }
    .winner-panel { margin-top:18px; padding:24px; }
    .winner-panel h2 { margin:0; font:700 28px/1.15 Georgia,serif; }
    .winner-options { display:grid; gap:10px; margin:16px 0; }
    .winner-option { display:grid; grid-template-columns:auto 1fr; gap:12px; padding:14px;
      border:1px solid var(--line); border-radius:16px; background:var(--card); cursor:pointer; }
    .winner-option pre { margin:0; white-space:pre-wrap; font:600 16px/1.45 inherit; }
    .none { border-color:#dfb6ad; background:#fff7f4; }
    .reveal { margin-top:20px; padding:24px; }
    .reveal h2 { margin:0 0 4px; font:700 28px/1.15 Georgia,serif; }
    .agreement { display:inline-block; margin:10px 0 18px; padding:7px 11px; border-radius:999px; background:var(--blue); font-weight:750; }
    .identity-grid { display:grid; gap:12px; }
    .identity-card { border:1px solid var(--line); border-radius:16px; padding:16px; }
    .identity-head { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .identity-head strong { font-family:Georgia,serif; font-size:20px; }
    .tag { border-radius:999px; padding:4px 8px; background:var(--mint); color:var(--green); font-size:11px; font-weight:800; }
    .identity-card pre { white-space:pre-wrap; font:600 15px/1.45 inherit; }
    .assessment { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:12px; font-size:14px; }
    .assessment h4 { margin:0 0 5px; }
    .assessment ul { margin:0; padding-left:18px; }
    .assessment pre { white-space:pre-wrap; overflow:auto; font-size:12px; }
    .private-drafts { margin-top:18px; padding:20px; }
    .private-draft { padding:14px 0; border-top:1px solid var(--line); }
    .private-draft pre { white-space:pre-wrap; font:500 15px/1.45 inherit; }
    .summary { display:none; }
    .summary.active { display:block; }
    .review.active { display:block; }
    .review.hidden { display:none; }
    .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin:20px 0; }
    .summary-card { padding:20px; }
    .metric { font:700 34px/1 Georgia,serif; color:var(--green); }
    .summary-list { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .summary-card h2 { margin-top:0; font-family:Georgia,serif; }
    .rewrite { padding:13px 0; border-top:1px solid var(--line); }
    .rewrite pre { white-space:pre-wrap; }
    dialog { width:min(680px,calc(100% - 28px)); border:1px solid var(--line); border-radius:22px;
      padding:24px; background:var(--card); color:var(--ink); box-shadow:var(--shadow); }
    dialog::backdrop { background:rgba(23,33,59,.35); backdrop-filter:blur(3px); }
    .dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
    .visually-hidden { position:absolute!important; width:1px!important; height:1px!important; padding:0!important;
      margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
    .toast { position:fixed; right:20px; bottom:20px; z-index:40; padding:12px 16px;
      border-radius:14px; background:var(--ink); color:white; opacity:0; transform:translateY(10px); pointer-events:none; }
    .toast.show { animation:toast 2.5s ease; }
    @keyframes toast { 0%,100%{opacity:0;transform:translateY(10px)} 10%,85%{opacity:1;transform:none} }
    @media (max-width:900px) {
      header { align-items:flex-start; flex-wrap:wrap; }
      .header-actions { order:2; width:100%; }
      .progress-wrap { order:3; flex-basis:100%; }
      main { padding-top:20px; }
      .orientation { align-items:flex-start; flex-direction:column; }
      .workspace { grid-template-columns:1fr; }
      .source-panel { position:static; }
      .images img { height:170px; }
      .candidate-card { min-height:270px; }
      .ratings,.summary-grid { grid-template-columns:1fr; }
      .reason-grid,.field-grid,.summary-list,.assessment { grid-template-columns:1fr; }
    }
    @media (prefers-reduced-motion:reduce) {
      *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; transition-duration:.01ms!important; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="brand">bibaling <span class="visually-hidden">human evaluation</span></div>
      <div class="progress-wrap">
        <div class="progress-label"><span id="progressText">Starting review</span><span id="savedText">Saved locally</span></div>
        <div class="progress-bar" aria-hidden="true"><span id="progressBar"></span></div>
      </div>
      <div class="header-actions">
        <button class="secondary" id="summaryButton">Summary</button>
        <button class="secondary" id="dataButton">Import / export</button>
      </div>
    </header>
    <main>
      <section class="review active" id="reviewScreen" aria-live="polite">
        <div class="orientation">
          <div>
            <div class="eyebrow" id="itemEyebrow"></div>
            <h1 id="itemTitle"></h1>
            <p class="context" id="itemContext"></p>
          </div>
          <div class="item-controls">
            <button class="secondary" id="previousItem">← Previous page</button>
            <button class="secondary" id="nextItem">Next page →</button>
          </div>
        </div>
        <div class="workspace">
          <article class="source-panel">
            <div class="images" id="sourceImages"></div>
            <div class="source-copy">
              <div class="eyebrow">English source</div>
              <p class="source" id="englishSource"></p>
              <details class="context-details">
                <summary>What this item tests</summary>
                <p id="visualContext"></p>
                <ul id="testingContext"></ul>
              </details>
            </div>
          </article>
          <div class="candidate-column">
            <div class="blind-label">
              <span class="blind-chip" id="blindLabel"></span>
              <span class="reviewed" id="candidateStatus"></span>
            </div>
            <article class="candidate-card" id="candidateCard">
              <div class="candidate-text" id="candidateText"></div>
              <div class="candidate-actions">
                <button class="secondary" id="speakButton">▶ Read aloud</button>
                <div class="dots" id="candidateDots" aria-label="Candidate position"></div>
                <div class="candidate-pager">
                  <button class="secondary" id="previousCandidate" aria-label="Previous candidate">←</button>
                  <button class="secondary" id="nextCandidate" aria-label="Next candidate">→</button>
                </div>
              </div>
            </article>
            <section class="form-card" id="candidateForm"></section>
            <section class="winner-panel" id="winnerPanel" hidden></section>
            <section class="reveal" id="revealPanel" hidden></section>
            <details class="private-drafts" id="privateDrafts">
              <summary>See all private drafts</summary>
              <div id="privateDraftList"></div>
            </details>
          </div>
        </div>
      </section>
      <section class="summary" id="summaryScreen">
        <div class="orientation">
          <div><div class="eyebrow">Human evaluation</div><h1>Review summary</h1>
            <p class="context">A local view of your completed and unfinished judgments.</p></div>
          <button class="primary" id="backToReview">Continue reviewing</button>
        </div>
        <div class="summary-grid" id="summaryMetrics"></div>
        <div class="summary-list">
          <section class="summary-card"><h2>Most common concerns</h2><div id="reasonSummary"></div></section>
          <section class="summary-card"><h2>Pages requiring rewrites</h2><div id="rewritePages"></div></section>
          <section class="summary-card" style="grid-column:1/-1"><h2>Preferred rewrites</h2><div id="rewriteList"></div></section>
        </div>
      </section>
    </main>
  </div>
  <dialog id="dataDialog">
    <h2>Keep or move your review</h2>
    <p>Reviews stay in this browser. Export a JSON backup or import one you saved earlier.</p>
    <input type="file" id="importInput" accept="application/json" hidden>
    <div class="dialog-actions">
      <button class="secondary" id="importButton">Import JSON</button>
      <button class="primary" id="exportButton">Export JSON</button>
      <button class="quiet" id="closeDialog">Close</button>
    </div>
  </dialog>
  <div class="toast" id="toast" role="status"></div>
  <script>
    const DATASET = ${safeJson(dataset)};
    const STORAGE_KEY = "bibaling-blind-review:" + DATASET.evaluationId;
    const RATINGS = [
      ["read_as_written","Would read as written"],
      ["needs_editing","Almost — needs editing"],
      ["would_not_use","Would not use"]
    ];
    const REASONS = [
      ["unnatural_phrasing","unnatural phrasing"],
      ["meaning_changed","meaning changed"],
      ["tone_wrong","tone wrong"],
      ["awkward_read_aloud_rhythm","awkward read-aloud rhythm"],
      ["forced_or_missing_rhyme","forced or missing rhyme"],
      ["vocabulary_unsuitable_for_young_child","vocabulary unsuitable for a young child"],
      ["unsupported_invention","unsupported invention"],
      ["repetition_or_consistency_problem","repetition or consistency problem"],
      ["regional_language_issue","regional-language issue"],
      ["other","other"]
    ];
    const byId = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, character =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character]));
    const now = () => new Date().toISOString();
    const freshState = () => ({
      schemaVersion:1,
      evaluationId:DATASET.evaluationId,
      runId:crypto.randomUUID ? crypto.randomUUID() : "review-" + Date.now(),
      language:DATASET.language,
      regionalVariant:DATASET.regionalVariant,
      startedAt:now(),
      updatedAt:now(),
      itemIndex:0,
      candidateIndexByItem:{},
      items:{}
    });
    let state;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || freshState(); }
    catch { state = freshState(); }
    let summaryVisible = false;

    function itemState(item) {
      if (!state.items[item.id]) {
        state.items[item.id] = {
          fixtureId:item.id,
          presentationOrder:[...item.presentationOrder],
          candidates:{},
          equivalentPairs:[],
          humanWinner:null,
          noneGoodEnough:false,
          completedAt:null
        };
      }
      return state.items[item.id];
    }
    function candidateReview(item, candidate) {
      const review = itemState(item);
      if (!review.candidates[candidate.id]) {
        review.candidates[candidate.id] = {
          candidateId:candidate.id,
          exactText:candidate.text,
          presentationIndex:review.presentationOrder.indexOf(candidate.id),
          rating:null,
          reasonTags:[],
          explanation:"",
          preferredRewrite:"",
          reviewedAt:null
        };
      }
      return review.candidates[candidate.id];
    }
    function save() {
      state.updatedAt = now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      byId("savedText").textContent = "Saved locally";
      updateProgress();
    }
    function currentItem() { return DATASET.items[state.itemIndex]; }
    function orderedCandidates(item) {
      const map = new Map(item.candidates.map(candidate => [candidate.id,candidate]));
      return itemState(item).presentationOrder.map(id => map.get(id)).filter(Boolean);
    }
    function currentCandidateIndex(item) {
      return Math.min(
        Number(state.candidateIndexByItem[item.id] || 0),
        item.candidates.length - 1
      );
    }
    function setCandidateIndex(item,index) {
      state.candidateIndexByItem[item.id] = (index + item.candidates.length) % item.candidates.length;
      save(); render();
    }
    function allRated(item) {
      return orderedCandidates(item).every(candidate => candidateReview(item,candidate).rating);
    }
    function itemComplete(item) {
      const review = itemState(item);
      return allRated(item) && Boolean(review.humanWinner || review.noneGoodEnough);
    }
    function updateProgress() {
      const completed = DATASET.items.filter(itemComplete).length;
      byId("progressText").textContent = completed + " of " + DATASET.items.length + " items complete";
      byId("progressBar").style.width = (completed / DATASET.items.length * 100) + "%";
    }
    function showToast(message) {
      const toast = byId("toast");
      toast.textContent = message;
      toast.classList.remove("show");
      requestAnimationFrame(() => toast.classList.add("show"));
    }
    function renderImages(item) {
      const container = byId("sourceImages");
      container.className = "images" + (item.images.length === 1 ? " single" : "");
      container.innerHTML = item.images.length
        ? item.images.map((source,index) =>
          '<img src="' + source + '" alt="Source book photo ' + (index + 1) + '">').join("")
        : '<div class="source-copy">Source image unavailable in this local build.</div>';
    }
    function renderForm(item,candidate,presentationIndex) {
      const review = candidateReview(item,candidate);
      const others = orderedCandidates(item).filter(other => other.id !== candidate.id);
      byId("candidateForm").innerHTML = \`
        <h2>Would you use this version?</h2>
        <div class="ratings">
          \${RATINGS.map(([value,label],index) => \`
            <div class="rating"><input type="radio" name="rating" id="rating-\${index}" value="\${value}"
              \${review.rating === value ? "checked" : ""}>
              <label for="rating-\${index}">\${label}</label></div>\`).join("")}
        </div>
        <div class="reason-grid">
          \${REASONS.map(([value,label]) => \`<label class="check"><input type="checkbox"
            data-reason="\${value}" \${review.reasonTags.includes(value) ? "checked" : ""}> <span>\${label}</span></label>\`).join("")}
        </div>
        <div class="field-grid">
          <label class="field">Explanation (optional)
            <textarea id="explanation" placeholder="What works—or gets in the way?">\${escapeHtml(review.explanation)}</textarea>
          </label>
          <label class="field">Preferred rewrite (optional)
            <textarea id="preferredRewrite" placeholder="Write the version you would rather read.">\${escapeHtml(review.preferredRewrite)}</textarea>
          </label>
        </div>
        <div class="equivalent">
          <strong>Effectively equivalent to:</strong>
          <div class="equivalent-list">
            \${others.map(other => {
              const pair = [candidate.id,other.id].sort().join("::");
              const otherPosition = orderedCandidates(item).findIndex(entry => entry.id === other.id);
              return \`<label class="check"><input type="checkbox" data-equivalent="\${pair}"
                \${itemState(item).equivalentPairs.includes(pair) ? "checked" : ""}>
                Candidate \${String.fromCharCode(65 + otherPosition)}</label>\`;
            }).join("")}
          </div>
        </div>\`;
      byId("candidateForm").querySelectorAll('input[name="rating"]').forEach(input =>
        input.addEventListener("change", event => {
          review.rating = event.target.value;
          review.reviewedAt = now();
          save(); render();
        }));
      byId("candidateForm").querySelectorAll("[data-reason]").forEach(input =>
        input.addEventListener("change", event => {
          const value = event.target.dataset.reason;
          review.reasonTags = event.target.checked
            ? [...new Set([...review.reasonTags,value])]
            : review.reasonTags.filter(reason => reason !== value);
          save();
        }));
      ["explanation","preferredRewrite"].forEach(field => {
        byId(field).addEventListener("input", event => {
          review[field] = event.target.value;
          save();
        });
      });
      byId("candidateForm").querySelectorAll("[data-equivalent]").forEach(input =>
        input.addEventListener("change", event => {
          const pair = event.target.dataset.equivalent;
          const reviewState = itemState(item);
          reviewState.equivalentPairs = event.target.checked
            ? [...new Set([...reviewState.equivalentPairs,pair])]
            : reviewState.equivalentPairs.filter(value => value !== pair);
          save();
        }));
      byId("candidateStatus").textContent = review.rating ? "Reviewed" : "Not rated yet";
    }
    function renderWinner(item) {
      const panel = byId("winnerPanel");
      if (!allRated(item)) { panel.hidden = true; return; }
      const review = itemState(item);
      panel.hidden = false;
      panel.innerHTML = \`<h2>Now choose the best version</h2>
        <p>Ratings help describe each option. Your winner is a separate judgment.</p>
        <div class="winner-options">
          \${orderedCandidates(item).map((candidate,index) => \`
            <label class="winner-option"><input type="radio" name="winner" value="\${candidate.id}"
              \${review.humanWinner === candidate.id ? "checked" : ""}>
              <span><strong>Candidate \${String.fromCharCode(65+index)}</strong>
              <pre>\${escapeHtml(candidate.text)}</pre></span></label>\`).join("")}
          <label class="winner-option none"><input type="radio" name="winner" value="none"
            \${review.noneGoodEnough ? "checked" : ""}>
            <span><strong>None are good enough</strong><br><small>No candidate should be treated as the winner.</small></span>
          </label>
        </div>
        <button class="primary" id="finishItem" \${review.humanWinner || review.noneGoodEnough ? "" : "disabled"}>
          Finish this item
        </button>\`;
      panel.querySelectorAll('input[name="winner"]').forEach(input =>
        input.addEventListener("change", event => {
          review.noneGoodEnough = event.target.value === "none";
          review.humanWinner = review.noneGoodEnough ? null : event.target.value;
          save(); renderWinner(item);
        }));
      byId("finishItem").addEventListener("click", () => {
        review.completedAt = now();
        save(); render();
        byId("revealPanel").scrollIntoView({behavior:"smooth",block:"start"});
      });
    }
    function sameSelection(item,review) {
      if (!review.humanWinner || !item.currentModelSelection) return null;
      const winner = item.candidates.find(candidate => candidate.id === review.humanWinner);
      return winner?.text === item.currentModelSelection;
    }
    function renderReveal(item) {
      const panel = byId("revealPanel");
      const review = itemState(item);
      if (!itemComplete(item) || !review.completedAt) { panel.hidden = true; return; }
      panel.hidden = false;
      const agreement = sameSelection(item,review);
      const human = item.candidates.find(candidate => candidate.id === review.humanWinner);
      panel.innerHTML = \`<h2>Comparison revealed</h2>
        <p>The blind review is complete for this item.</p>
        <span class="agreement">\${item.currentModelSelection
          ? (agreement ? "Human and comparative editor agree" : "Human and comparative editor differ")
          : "No comparative-editor reevaluation yet"}</span>
        <p><strong>Previous automatic selection:</strong> \${escapeHtml(item.previousModelSelection || "None")}</p>
        <p><strong>New comparative-editor selection:</strong> \${escapeHtml(item.currentModelSelection || "Not available yet")}</p>
        <p><strong>Human selection:</strong> \${escapeHtml(review.noneGoodEnough ? "None are good enough" : human?.text || "None")}</p>
        \${item.priorHumanFinding ? \`<details class="context-details"><summary>Previously recorded human finding</summary>
          <pre>\${escapeHtml(JSON.stringify(item.priorHumanFinding,null,2))}</pre></details>\` : ""}
        <div class="identity-grid">
          \${item.candidates.slice().sort((a,b)=>a.originalOrder-b.originalOrder).map(candidate => {
            const presented = review.presentationOrder.indexOf(candidate.id);
            return \`<article class="identity-card">
              <div class="identity-head"><strong>Original finalist \${candidate.originalOrder}</strong>
                <span class="tag">Shown blind as Candidate \${String.fromCharCode(65+presented)}</span>
                \${candidate.rank ? \`<span class="tag">Model rank \${candidate.rank}</span>\` : ""}
                \${candidate.previousModelSelected ? '<span class="tag">Previous selection</span>' : ""}
                \${candidate.currentModelSelected ? '<span class="tag">Comparative selection</span>' : ""}
              </div>
              <pre>\${escapeHtml(candidate.text)}</pre>
              <div class="assessment">
                <div><h4>Strengths</h4>\${candidate.strengths?.length
                  ? '<ul>'+candidate.strengths.map(value=>'<li>'+escapeHtml(value)+'</li>').join("")+'</ul>'
                  : '<p>Not available in the original evaluation.</p>'}</div>
                <div><h4>Weaknesses</h4>\${candidate.weaknesses?.length
                  ? '<ul>'+candidate.weaknesses.map(value=>'<li>'+escapeHtml(value)+'</li>').join("")+'</ul>'
                  : '<p>Not available in the original evaluation.</p>'}</div>
                <div><h4>Comparative assessment</h4><pre>\${escapeHtml(
                  candidate.comparativeAssessment ? JSON.stringify(candidate.comparativeAssessment,null,2) : "Not available yet."
                )}</pre></div>
                <div><h4>Rhyme assessment</h4><pre>\${escapeHtml(
                  candidate.rhymeAssessment ? JSON.stringify(candidate.rhymeAssessment,null,2) : "Not available yet."
                )}</pre></div>
              </div>
            </article>\`;
          }).join("")}
        </div>\`;
    }
    function renderPrivateDrafts(item) {
      byId("privateDraftList").innerHTML = item.privateDrafts.map((draft,index) =>
        \`<div class="private-draft"><strong>Draft \${index+1}: \${escapeHtml(draft.strategy || draft.name || "")}</strong>
          <pre>\${escapeHtml(draft.text || draft.refrain)}</pre></div>\`).join("");
    }
    function render() {
      if (summaryVisible) { renderSummary(); return; }
      const item = currentItem();
      const candidates = orderedCandidates(item);
      const candidateIndex = currentCandidateIndex(item);
      const candidate = candidates[candidateIndex];
      byId("itemEyebrow").textContent = item.sourceBook + " · " + item.bookForm.replaceAll("_"," ");
      byId("itemTitle").textContent = item.title;
      byId("itemContext").textContent = "Review each Spanish version independently before choosing a winner.";
      byId("englishSource").textContent = item.englishSource;
      byId("visualContext").textContent = item.visualContext;
      byId("testingContext").innerHTML = item.testingContext.map(value=>"<li>"+escapeHtml(value)+"</li>").join("");
      renderImages(item);
      byId("blindLabel").textContent = "Candidate " + String.fromCharCode(65+candidateIndex) + " of 3";
      byId("candidateText").textContent = candidate.text;
      byId("candidateDots").innerHTML = candidates.map((_,index) =>
        '<button class="dot '+(index===candidateIndex?"active":"")+'" data-index="'+index+
        '" aria-label="Show candidate '+String.fromCharCode(65+index)+'"></button>').join("");
      byId("candidateDots").querySelectorAll("[data-index]").forEach(button =>
        button.addEventListener("click",()=>setCandidateIndex(item,Number(button.dataset.index))));
      byId("previousCandidate").disabled = candidateIndex === 0;
      byId("nextCandidate").disabled = candidateIndex === candidates.length - 1;
      byId("previousItem").disabled = state.itemIndex === 0;
      byId("nextItem").disabled = state.itemIndex === DATASET.items.length - 1;
      renderForm(item,candidate,candidateIndex);
      renderWinner(item);
      renderReveal(item);
      renderPrivateDrafts(item);
      updateProgress();
    }
    function renderSummary() {
      byId("reviewScreen").classList.add("hidden");
      byId("summaryScreen").classList.add("active");
      const itemReviews = DATASET.items.map(item => ({item,review:itemState(item)}));
      const allCandidateReviews = itemReviews.flatMap(({review})=>Object.values(review.candidates));
      const rated = allCandidateReviews.filter(review=>review.rating);
      const readAsWritten = rated.filter(review=>review.rating==="read_as_written").length;
      const comparable = itemReviews.filter(({item,review})=>item.currentModelSelection && itemComplete(item) && review.humanWinner);
      const agreements = comparable.filter(({item,review}) =>
        item.candidates.find(candidate=>candidate.id===review.humanWinner)?.text===item.currentModelSelection).length;
      const completed = itemReviews.filter(({item})=>itemComplete(item)).length;
      byId("summaryMetrics").innerHTML = [
        ["Progress",completed+"/"+DATASET.items.length],
        ["Would read as written",rated.length ? Math.round(readAsWritten/rated.length*100)+"%" : "—"],
        ["Human/editor agreement",comparable.length ? Math.round(agreements/comparable.length*100)+"%" : "Not available"],
        ["Candidates rated",rated.length+"/"+(DATASET.items.length*3)]
      ].map(([label,value])=>'<article class="summary-card"><div class="metric">'+value+'</div><div>'+label+'</div></article>').join("");
      const reasonCounts = {};
      rated.flatMap(review=>review.reasonTags).forEach(reason=>reasonCounts[reason]=(reasonCounts[reason]||0)+1);
      byId("reasonSummary").innerHTML = Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1])
        .map(([reason,count])=>'<p><strong>'+count+'×</strong> '+escapeHtml(REASONS.find(entry=>entry[0]===reason)?.[1]||reason)+'</p>').join("") || "<p>No concerns recorded yet.</p>";
      const requiringRewrite = itemReviews.filter(({item,review}) =>
        review.noneGoodEnough || Object.values(review.candidates).some(candidate =>
          candidate.rating==="would_not_use" || candidate.preferredRewrite));
      byId("rewritePages").innerHTML = requiringRewrite.map(({item})=>"<p>"+escapeHtml(item.title)+"</p>").join("") || "<p>None yet.</p>";
      const rewrites = itemReviews.flatMap(({item,review})=>Object.values(review.candidates)
        .filter(candidate=>candidate.preferredRewrite)
        .map(candidate=>({title:item.title,...candidate})));
      byId("rewriteList").innerHTML = rewrites.map(rewrite=>\`<div class="rewrite"><strong>\${escapeHtml(rewrite.title)}</strong>
        <pre>\${escapeHtml(rewrite.preferredRewrite)}</pre></div>\`).join("") || "<p>No preferred rewrites yet.</p>";
      updateProgress();
    }
    function exportPayload() {
      return {
        schemaVersion:state.schemaVersion,
        evaluationId:state.evaluationId,
        runId:state.runId,
        language:state.language,
        regionalVariant:state.regionalVariant,
        startedAt:state.startedAt,
        updatedAt:state.updatedAt,
        exportedAt:now(),
        items:DATASET.items.map(item => {
          const review=itemState(item);
          return {
            fixtureId:item.id,
            presentationOrder:review.presentationOrder,
            candidates:review.presentationOrder.map(candidateId => {
              const candidate=item.candidates.find(value=>value.id===candidateId);
              return {...candidateReview(item,candidate),exactText:candidate.text};
            }),
            equivalentPairs:review.equivalentPairs,
            humanWinner:review.humanWinner,
            noneGoodEnough:review.noneGoodEnough,
            timestamp:review.completedAt,
            previousModelSelection:item.previousModelSelection,
            currentModelSelection:item.currentModelSelection,
            priorHumanFinding:item.priorHumanFinding
          };
        })
      };
    }
    function downloadJson() {
      const blob=new Blob([JSON.stringify(exportPayload(),null,2)+"\\n"],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url; link.download="bibaling-spanish-human-review-"+state.runId+".json"; link.click();
      URL.revokeObjectURL(url); showToast("Review exported");
    }
    function importJson(file) {
      const reader=new FileReader();
      reader.onload=()=>{
        try {
          const imported=JSON.parse(reader.result);
          if(imported.evaluationId!==DATASET.evaluationId) throw new Error("This review belongs to a different evaluation.");
          const next=freshState();
          next.runId=imported.runId||next.runId;
          next.startedAt=imported.startedAt||next.startedAt;
          for(const importedItem of imported.items||[]) {
            const item=DATASET.items.find(value=>value.id===importedItem.fixtureId);
            if(!item) continue;
            next.items[item.id]={
              fixtureId:item.id,
              presentationOrder:importedItem.presentationOrder,
              candidates:Object.fromEntries((importedItem.candidates||[]).map(candidate=>[candidate.candidateId,candidate])),
              equivalentPairs:importedItem.equivalentPairs||[],
              humanWinner:importedItem.humanWinner||null,
              noneGoodEnough:Boolean(importedItem.noneGoodEnough),
              completedAt:importedItem.timestamp||null
            };
          }
          state=next; save(); byId("dataDialog").close(); render(); showToast("Review imported");
        } catch(error) { alert(error.message||"Could not import this review."); }
      };
      reader.readAsText(file);
    }
    byId("previousCandidate").addEventListener("click",()=>setCandidateIndex(currentItem(),currentCandidateIndex(currentItem())-1));
    byId("nextCandidate").addEventListener("click",()=>setCandidateIndex(currentItem(),currentCandidateIndex(currentItem())+1));
    byId("previousItem").addEventListener("click",()=>{state.itemIndex=Math.max(0,state.itemIndex-1);save();render();scrollTo(0,0)});
    byId("nextItem").addEventListener("click",()=>{state.itemIndex=Math.min(DATASET.items.length-1,state.itemIndex+1);save();render();scrollTo(0,0)});
    byId("speakButton").addEventListener("click",()=>{
      if(!("speechSynthesis" in window)){showToast("Read aloud is not supported in this browser");return;}
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(orderedCandidates(currentItem())[currentCandidateIndex(currentItem())].text);
      utterance.lang="es-ES"; speechSynthesis.speak(utterance);
    });
    byId("summaryButton").addEventListener("click",()=>{summaryVisible=true;renderSummary();scrollTo(0,0)});
    byId("backToReview").addEventListener("click",()=>{summaryVisible=false;byId("summaryScreen").classList.remove("active");byId("reviewScreen").classList.remove("hidden");render();scrollTo(0,0)});
    byId("dataButton").addEventListener("click",()=>byId("dataDialog").showModal());
    byId("closeDialog").addEventListener("click",()=>byId("dataDialog").close());
    byId("exportButton").addEventListener("click",downloadJson);
    byId("importButton").addEventListener("click",()=>byId("importInput").click());
    byId("importInput").addEventListener("change",event=>event.target.files[0]&&importJson(event.target.files[0]));
    document.addEventListener("keydown",event=>{
      if(event.target.matches("textarea,input")) return;
      if(event.key==="ArrowLeft") setCandidateIndex(currentItem(),currentCandidateIndex(currentItem())-1);
      if(event.key==="ArrowRight") setCandidateIndex(currentItem(),currentCandidateIndex(currentItem())+1);
      if(["1","2","3"].includes(event.key)) {
        const input=document.querySelectorAll('input[name="rating"]')[Number(event.key)-1];
        if(input){input.checked=true;input.dispatchEvent(new Event("change",{bubbles:true}));}
      }
    });
    render();
  </script>
</body>
</html>`;
}

async function main() {
  const [bundle, humanFindings] = await Promise.all([
    readFile(resolve(artifactDirectory, "review-bundle.json"), "utf8")
      .then((contents) => JSON.parse(contents) as ReviewBundle),
    readFile(resolve(artifactDirectory, "human-findings.json"), "utf8")
      .then((contents) => JSON.parse(contents) as HumanFindings)
  ]);
  const dataset = await buildDataset(bundle, humanFindings);
  await writeFile(outputPath, page(dataset));
  console.log(JSON.stringify({
    outputPath,
    items: dataset.items.length,
    candidates: dataset.items.reduce(
      (total, item) => total + (item as Record<string, any>).candidates.length,
      0
    ),
    embeddedImages: dataset.items.reduce(
      (total, item) => total + (item as Record<string, any>).images.length,
      0
    )
  }, null, 2));
}

void main();
