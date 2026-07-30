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

test("all photos precede the Page 1 gate and capture starts durable delivery", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/delivery/route.ts", import.meta.url), "utf8");
  const contract = await readFile(new URL("../app/api/delivery/contract.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../app/workflows/book-delivery.ts", import.meta.url), "utf8");
  const writeSpread1 = page.slice(
    page.indexOf("async function writeSpread1"),
    page.indexOf("async function lockDirectionAndWriteSpread1")
  );
  const captureEmail = page.slice(
    page.indexOf("async function captureEmail"),
    page.indexOf("async function addRemainingFiles")
  );
  const pageOneScreen = page.slice(page.indexOf("{step === 7"), page.indexOf("{step === 8"));
  const deliveryScreen = page.slice(page.indexOf("{step === 8"), page.indexOf("{step === 9"));

  assert.match(page, /spreads\.length < 3/);
  assert.match(page, /Add every page from your book/);
  assert.match(page, /all_photos_uploaded/);
  assert.ok(
    writeSpread1.indexOf('trackFunnelEventOnce("first_page_translation_displayed"') <
    writeSpread1.indexOf('trackFunnelEventOnce("email_gate_displayed"')
  );
  assert.match(pageOneScreen, /spread1Options\.length > 0/);
  assert.match(pageOneScreen, /Like your first page\? Let’s finish the book\./);
  assert.match(pageOneScreen, /Email me the finished translation/);
  assert.match(captureEmail, /spread1Selection === null/);
  assert.match(captureEmail, /spread1Options\[spread1Selection\]\?\.text\.trim\(\)/);
  assert.match(captureEmail, /setLeadReceipt\(result\.receipt\)/);
  assert.match(captureEmail, /postJson<\{ jobToken: string; status: "processing" \}>\("\/api\/delivery"/);
  assert.match(captureEmail, /pages: spreads\.map/);
  assert.doesNotMatch(captureEmail, /preview|file\.name|startPatternTest/);
  const captureFailure = captureEmail.slice(captureEmail.indexOf("} catch (error)"));
  assert.doesNotMatch(
    captureFailure,
    /setSpreads|setSpread1Options|setSpread1Selection|setApprovedSpread1|setApprovedNotes/
  );
  assert.ok(captureEmail.indexOf('trackFunnelEventOnce("generate_lead"') < captureEmail.indexOf('trackFunnelEventOnce("remaining_translation_started"'));
  assert.match(deliveryScreen, /You can safely close this page/);
  assert.doesNotMatch(deliveryScreen, /OptionList|patternOptions|Save finished draft|Add the rest of the book/);
  assert.match(page, /emailRequest\.loading/);
  assert.match(page, /emailRequest\.error/);
  assert.match(route, /verifyLeadReceipt\(input\.leadReceipt, input\.bookForm\)/);
  assert.match(route, /start\(deliverBookWorkflow/);
  assert.doesNotMatch(contract, /photo|preview|filename|visualContext/i);
  assert.match(workflow, /"use workflow"/);
  assert.match(workflow, /"use step"/);
  assert.match(workflow, /sendTranslationEmailStep\.maxRetries = 3/);
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
  assert.match(analytics, /sent\.has\(name\)/);
  assert.match(analytics, /params:\s*\{\s*book_form\?[\s\S]*language_pair/);
  assert.doesNotMatch(analytics, /session_id|email_address|filename|translation_text|jobToken/);
  for (const event of [
    "translator_opened",
    "all_photos_uploaded",
    "first_page_generation_started",
    "first_page_translation_displayed",
    "email_gate_displayed",
    "generate_lead",
    "remaining_translation_started",
    "delivery_succeeded",
    "delivery_failed"
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
