import assert from "node:assert/strict";

const baseUrl = process.env.BIBALING_SMOKE_BASE_URL || "http://localhost:3000";
const headers = {
  "Content-Type": "application/json",
  Cookie: "bibaling_mock_mode=true"
};

const fixtures = {
  prose_story: [
    "Mara opened the gate and followed the path.",
    "At the pond, she found a tiny boat.",
    "She sailed home before supper."
  ],
  continuous_verse: [
    "Morning opens\nacross the quiet field",
    "A red leaf turns\nunder the bridge",
    "We listen\nuntil the rain ends"
  ],
  refrain_verse: [
    "Bear climbs the hill.\nTogether we can find the way.",
    "Fox crosses the stream.\nTogether we can find the way.",
    "Rabbit enters the wood.\nTogether we can find the way."
  ]
} as const;

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert.equal(response.ok, true, `${path} failed (${response.status}): ${text}`);
  return { response, text };
}

for (const [bookForm, texts] of Object.entries(fixtures)) {
  const classification = await post("/api/book-form", {
    texts,
    visualContexts: texts.map(() => "Mock visual context.")
  });
  const classified = JSON.parse(classification.text);
  assert.equal(classified.bookForm, bookForm);

  const direction = bookForm === "refrain_verse"
    ? {
        name: "Mock refrain",
        refrain: "[MOCK] Skupaj najdemo pot.",
        approach: "Interface-only fixture.",
        genderDependency: "None."
      }
    : undefined;

  if (bookForm === "refrain_verse") {
    const directions = await post("/api/directions", {
      texts,
      visualContexts: texts.map(() => "Mock visual context."),
      priority: "rhythm",
      freedom: "natural",
      freshDraft: false
    });
    assert.match(directions.text, /"type":"result"/);
  }

  const context = {
    bookForm,
    sourceRhyme: bookForm === "continuous_verse" ? "none" : bookForm === "prose_story" ? "none" : "occasional",
    priority: "rhythm",
    freedom: "natural",
    ...(direction ? { direction } : {})
  };

  const spread1 = await post("/api/translations", {
    mode: "spread1",
    visualContext: "Mock visual context.",
    source: texts[0],
    ...context
  });
  assert.equal(JSON.parse(spread1.text).runs[0].options.length, 3);

  const lead = await post("/api/leads", {
    email: `${bookForm}@example.com`,
    marketingConsent: false,
    capturedAt: "2026-07-29T18:00:00.000Z",
    attribution: {
      source: "mock",
      medium: "test",
      campaign: "",
      content: "",
      term: "",
      landingPage: "http://localhost/mock"
    },
    languagePair: "en-sl",
    bookForm
  });
  const capturedLead = JSON.parse(lead.text);
  assert.equal(capturedLead.captured, true);

  const delivery = await post("/api/delivery", {
    leadReceipt: capturedLead.receipt,
    recipientEmail: `${bookForm}@example.com`,
    pages: texts.map((sourceText, index) => ({ page: index + 1, sourceText })),
    approvedPage1: "[MOCK — NOT QUALITY EVALUATED] Approved Page 1.",
    ...context
  });
  const started = JSON.parse(delivery.text);
  assert.equal(started.status, "processing");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const status = await fetch(`${baseUrl}/api/delivery/status?token=${encodeURIComponent(started.jobToken)}`, {
    headers: { Cookie: "bibaling_mock_mode=true" }
  });
  const statusBody = await status.text();
  assert.equal(status.ok, true, statusBody);
  assert.equal(JSON.parse(statusBody).status, "completed");

  process.stdout.write(`✓ ${bookForm}\n`);
}
