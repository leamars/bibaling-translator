import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contactPayload, resendLeadCaptureAdapter } from "../app/api/leads/resend-adapter.ts";
import type { LeadCapture } from "../app/api/leads/contract.ts";

process.env.RESEND_LEADS_SEGMENT_ID ||= "segment_test";

const lead: LeadCapture = {
  email: "parent@example.com",
  marketingConsent: false,
  capturedAt: "2026-07-29T18:00:00.000Z",
  attribution: {
    source: "google",
    medium: "cpc",
    campaign: "summer",
    content: "verse",
    term: "book translation",
    landingPage: "https://bibaling.example/"
  },
  languagePair: "en-sl",
  bookForm: "continuous_verse"
};

test("Resend receives only allowlisted non-book lead data", () => {
  const payload = contactPayload(lead);
  const keys = Object.keys(payload.properties);
  for (const forbidden of ["photo", "filename", "book_text", "translation", "feedback", "prompt", "model"]) {
    assert.equal(keys.some((key) => new RegExp(forbidden, "i").test(key)), false);
  }
  assert.equal("topics" in payload, false);
  assert.deepEqual(payload.segments, [{ id: "segment_test" }]);
  assert.equal(payload.properties.marketing_consent, "not_granted");
});

test("lead capture fails closed when the durable Resend segment is missing", () => {
  const previous = process.env.RESEND_LEADS_SEGMENT_ID;
  delete process.env.RESEND_LEADS_SEGMENT_ID;
  assert.throws(() => contactPayload(lead), /leads segment is not configured/);
  if (previous !== undefined) process.env.RESEND_LEADS_SEGMENT_ID = previous;
});

test("marketing topic membership requires explicit consent", () => {
  const previous = process.env.RESEND_MARKETING_TOPIC_ID;
  process.env.RESEND_MARKETING_TOPIC_ID = "topic_test";
  const payload = contactPayload({ ...lead, marketingConsent: true });
  assert.deepEqual(payload.topics, [{ id: "topic_test", subscription: "opt_in" }]);
  if (previous === undefined) delete process.env.RESEND_MARKETING_TOPIC_ID;
  else process.env.RESEND_MARKETING_TOPIC_ID = previous;
});

test("marketing opt-in fails closed when no Resend topic is configured", () => {
  const previous = process.env.RESEND_MARKETING_TOPIC_ID;
  delete process.env.RESEND_MARKETING_TOPIC_ID;
  assert.throws(() => contactPayload({ ...lead, marketingConsent: true }), /topic is not configured/);
  if (previous !== undefined) process.env.RESEND_MARKETING_TOPIC_ID = previous;
});

test("existing Resend contacts update properties and memberships through the documented endpoints", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousTopic = process.env.RESEND_MARKETING_TOPIC_ID;
  process.env.RESEND_API_KEY = "test_key";
  process.env.RESEND_MARKETING_TOPIC_ID = "topic_test";
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method || "GET",
      body: typeof init?.body === "string" ? init.body : undefined
    });
    return Response.json({ id: "contact_test" });
  }) as typeof fetch;
  try {
    const result = await resendLeadCaptureAdapter.capture({ ...lead, marketingConsent: true });
    assert.deepEqual(result, { contactId: "contact_test", created: false });
    assert.equal(requests.length, 3);
    assert.match(requests[0].url, /\/contacts\/parent%40example\.com$/);
    assert.deepEqual(Object.keys(JSON.parse(requests[0].body || "{}")), ["properties"]);
    assert.match(requests[1].url, /\/contacts\/parent%40example\.com\/segments\/segment_test$/);
    assert.match(requests[2].url, /\/contacts\/parent%40example\.com\/topics$/);
    assert.deepEqual(JSON.parse(requests[2].body || "{}"), {
      topics: [{ id: "topic_test", subscription: "opt_in" }]
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousTopic === undefined) delete process.env.RESEND_MARKETING_TOPIC_ID;
    else process.env.RESEND_MARKETING_TOPIC_ID = previousTopic;
  }
});

test("email gate follows visible Page 1 results and guards Pages 2–3 and full-book work", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8");
  const writeSpread1 = page.slice(
    page.indexOf("async function writeSpread1"),
    page.indexOf("async function lockDirectionAndWriteSpread1")
  );
  const captureEmail = page.slice(
    page.indexOf("async function captureEmail"),
    page.indexOf("async function addRemainingFiles")
  );
  const pageOneScreen = page.slice(page.indexOf("{step === 7"), page.indexOf("{step === 8"));
  const reviewScreen = page.slice(page.indexOf("{step === 9"), page.indexOf("{step === 10"));
  const approvePattern = page.slice(
    page.indexOf("function approvePattern"),
    page.indexOf("function startRestOfBook")
  );
  const fullBook = page.slice(
    page.indexOf("async function generateRestOfBook"),
    page.indexOf("function updateBookTranslation")
  );

  assert.match(page, /spreads\.length !== 3/);
  assert.ok(
    writeSpread1.indexOf('trackFunnelEventOnce("first_translation_seen"') <
    writeSpread1.indexOf('trackFunnelEventOnce("email_gate_viewed"')
  );
  assert.match(pageOneScreen, /spread1Options\.length > 0/);
  assert.match(pageOneScreen, /Want to translate the rest of the book and keep your work\?/);
  assert.match(pageOneScreen, /Continue with the rest of the book/);
  assert.doesNotMatch(reviewScreen, /email-gate|captureEmail|type="email"/);
  assert.match(captureEmail, /spread1Selection === null/);
  assert.match(captureEmail, /spread1Options\[spread1Selection\]\?\.text\.trim\(\)/);
  assert.match(captureEmail, /setLeadReceipt\(result\.receipt\)/);
  assert.match(captureEmail, /startPatternTest\(approved, approvedNote, result\.receipt\)/);
  assert.doesNotMatch(captureEmail, /three_page_preview_seen|qualified_lead/);
  const captureFailure = captureEmail.slice(captureEmail.indexOf("} catch (error)"));
  assert.doesNotMatch(
    captureFailure,
    /setSpreads|setSpread1Options|setSpread1Selection|setApprovedSpread1|setApprovedNotes/
  );
  assert.ok(
    captureEmail.indexOf('trackFunnelEventOnce("email_captured"') <
    captureEmail.indexOf("startPatternTest(approved, approvedNote, result.receipt)")
  );
  assert.ok(
    approvePattern.indexOf('trackFunnelEventOnce("three_page_preview_seen"') <
    approvePattern.indexOf('trackFunnelEventOnce("qualified_lead"')
  );
  assert.match(approvePattern, /if \(emailCaptured\)[\s\S]*qualified_lead/);
  assert.match(fullBook, /trackFunnelEventOnce\("full_book_started"/);
  assert.match(page, /if \(!captureReceipt \|\| !bookForm/);
  assert.match(page, /mode: "pattern",\s*leadReceipt: captureReceipt/);
  assert.match(page, /if \(!emailCaptured \|\| !leadReceipt\) return/);
  assert.match(page, /step === 10 && emailCaptured/);
  assert.match(page, /emailRequest\.loading/);
  assert.match(page, /emailRequest\.error/);
  assert.match(route, /input\.mode === "pattern"[\s\S]*verifyLeadReceipt\(input\.leadReceipt, input\.bookForm\)/);
  assert.ok(route.indexOf("verifyLeadReceipt(input.leadReceipt") < route.indexOf("generateFullBook({ client"));
});

test("email-gate consent is separate, unchecked, and non-blocking", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const pageOneScreen = page.slice(page.indexOf("{step === 7"), page.indexOf("{step === 8"));
  assert.match(page, /const \[marketingConsent, setMarketingConsent\] = useState\(false\)/);
  assert.match(page, /const \[analyticsConsent, setAnalyticsConsentChoice\] = useState\(false\)/);
  assert.match(pageOneScreen, /Send me occasional Bibaling news and product updates\./);
  assert.match(pageOneScreen, /Allow anonymous usage analytics to help improve Bibaling\./);
  assert.doesNotMatch(pageOneScreen, />Optional</);
  assert.match(pageOneScreen, /disabled=\{\s*emailRequest\.loading \|\|[\s\S]*spread1Options\[spread1Selection\]\?\.text\.trim\(\)\s*\}/);
  assert.doesNotMatch(
    pageOneScreen.match(/disabled=\{\s*emailRequest\.loading[\s\S]*?\n\s*\}/)?.[0] || "",
    /marketingConsent|analyticsConsent/
  );
});

test("GA adapter is consent-gated, anonymous, typed, and once-only", async () => {
  const analytics = await readFile(new URL("../app/analytics.ts", import.meta.url), "utf8");
  assert.match(analytics, /analytics_storage/);
  assert.match(analytics, /consented\(\)/);
  assert.match(analytics, /crypto\.randomUUID\(\)/);
  assert.match(analytics, /sent\.has\(name\)/);
  assert.match(analytics, /params:\s*\{\s*book_form\?[\s\S]*language_pair[\s\S]*session_id/);
  for (const event of [
    "first_translation_seen",
    "three_page_preview_seen",
    "email_gate_viewed",
    "email_captured",
    "qualified_lead",
    "full_book_started"
  ]) assert.match(analytics, new RegExp(event));
});

test("mock lead capture bypasses Resend deterministically", async () => {
  const route = await readFile(new URL("../app/api/leads/route.ts", import.meta.url), "utf8");
  assert.match(route, /isMockRequest\(request\)/);
  assert.doesNotMatch(route, /contactId: "mock-contact"/);
  assert.match(route, /receipt: "mock-lead-receipt"/);
  assert.match(route, /mock: true/);
  assert.ok(route.indexOf("isMockRequest(request)") < route.indexOf("resendLeadCaptureAdapter.capture"));
  assert.match(route, /capturedAt: new Date\(\)\.toISOString\(\)/);
});
