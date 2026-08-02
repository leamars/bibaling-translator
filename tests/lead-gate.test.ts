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
  targetLanguage: "sl",
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

test("the workshop precedes the gate; Page 4 is revealed before Page 5 is interrupted; capture starts durable delivery", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/delivery/route.ts", import.meta.url), "utf8");
  const translations = await readFile(new URL("../app/api/translations/route.ts", import.meta.url), "utf8");
  const contract = await readFile(new URL("../app/api/delivery/contract.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../app/workflows/book-delivery.ts", import.meta.url), "utf8");
  const startTeaser = page.slice(
    page.indexOf("async function startTeaser"),
    page.indexOf("async function captureEmail")
  );
  const captureEmail = page.slice(
    page.indexOf("async function captureEmail"),
    page.indexOf("const retry = step === 3")
  );
  const startRestOfBook = page.slice(
    page.indexOf("function startRestOfBook"),
    page.indexOf("function moveBookPage")
  );
  const pageOneScreen = page.slice(page.indexOf("{step === 7"), page.indexOf("{step === 8"));
  const patternScreen = page.slice(page.indexOf("{step === 8"), page.indexOf("{step === 9"));
  const arrangeScreen = page.slice(page.indexOf("{step === 10"), page.indexOf("{step === 11"));
  const teaserScreen = page.slice(page.indexOf("{step === 11"), page.indexOf("{step === 12"));
  const deliveryScreen = page.slice(page.indexOf("{step === 12"), page.indexOf("{expandedImage"));

  assert.match(page, /spreads\.length < INITIAL_SAMPLE_LIMIT/);
  assert.match(page, /Add three photos from your book/);
  assert.match(page, /They don’t need to be in order/);
  assert.match(page, /sample_pages_uploaded/);
  assert.match(page, /all_photos_uploaded/);

  // The historical two-stage upload is restored: exactly three unordered
  // voice samples first, then the complete book is arranged before Page 4.
  assert.match(arrangeScreen, /Arrange the whole book\./);
  assert.match(arrangeScreen, /rest-drop/);
  assert.match(arrangeScreen, /drag to rearrange/);
  assert.match(arrangeScreen, /moveBookPage/);
  assert.match(arrangeScreen, /Approved voice sample/);
  assert.doesNotMatch(arrangeScreen, /email-gate/);
  assert.match(startRestOfBook, /spread\.sampleNumber/);
  assert.match(startRestOfBook, /approvedDrafts\[spread\.sampleNumber\]/);

  // The full workshop happens before any email ask.
  assert.match(pageOneScreen, /Approve and test the pattern/);
  assert.doesNotMatch(pageOneScreen, /email-gate|Email me the finished translation/);
  assert.match(patternScreen, /Does this voice work on every page\?/);
  assert.doesNotMatch(patternScreen, /email-gate|leadReceipt/);
  assert.doesNotMatch(page.slice(0, page.indexOf("async function startTeaser")), /mode: "pattern",\s*\n\s*leadReceipt/);

  // The teaser writes and reveals Page 4, then visibly begins Page 5 before
  // the gate takes its place. A preview failure still opens the gate.
  assert.match(startTeaser, /mode: "preview"/);
  assert.match(startTeaser, /spread\.voiceSample && spread\.approvedText/);
  assert.match(startTeaser, /spread: \{ spread: 4/);
  assert.match(startTeaser, /status: "unavailable"/);
  assert.match(page, /setTimeout\(\(\) => setEmailGateVisible\(true\), 1_800\)/);
  assert.match(startTeaser, /setEmailGateVisible\(true\)/);
  assert.match(teaserScreen, /teaser\.page\.text/);
  assert.match(teaserScreen, /Page 5/);
  assert.match(teaserScreen, /nextPageLoadingMessages/);
  assert.match(teaserScreen, /emailGateVisible && !emailCaptured/);
  assert.match(teaserScreen, /Keep Page 5 going\./);
  assert.match(teaserScreen, /Email me the finished translation/);

  // Capture requires the approved workshop pages and starts durable delivery
  // with the approved voice and the teaser seed.
  assert.match(captureEmail, /approvedVoice\.length !== INITIAL_SAMPLE_LIMIT/);
  assert.match(captureEmail, /spread\.voiceSample && spread\.approvedText/);
  assert.match(captureEmail, /setLeadReceipt\(result\.receipt\)/);
  assert.match(captureEmail, /postJson<\{ jobToken: string; status: "processing" \}>\("\/api\/delivery"/);
  assert.match(captureEmail, /pages: spreads\.map/);
  assert.match(captureEmail, /visualContext: spread\.visualContext/);
  assert.match(captureEmail, /approvedPages: approvedVoice/);
  assert.match(captureEmail, /previewPages: teaser\.page \? \[\{ page: teaser\.page\.page, text: teaser\.page\.text \}\] : \[\]/);
  assert.doesNotMatch(captureEmail, /file\.name|startPatternTest/);
  const captureFailure = captureEmail.slice(captureEmail.indexOf("} catch (error)"));
  assert.doesNotMatch(
    captureFailure,
    /setSpreads|setSpread1Options|setSpread1Selection|setApprovedSpread1|setApprovedNotes|setTeaser/
  );
  assert.ok(captureEmail.indexOf('trackFunnelEventOnce("generate_lead"') < captureEmail.indexOf('trackFunnelEventOnce("remaining_translation_started"'));
  assert.match(deliveryScreen, /You can safely close this page/);
  assert.doesNotMatch(deliveryScreen, /OptionList|patternOptions|Save finished draft|Add the rest of the book/);
  assert.match(page, /emailRequest\.loading/);
  assert.match(page, /emailRequest\.error/);

  // Only delivery requires the signed receipt; the workshop and teaser do not.
  assert.match(route, /verifyLeadReceipt\(input\.leadReceipt, input\.bookForm, input\.targetLanguage, input\.regionalVariant\)/);
  assert.match(route, /start\(deliverBookWorkflow/);
  assert.doesNotMatch(translations, /verifyLeadReceipt|leadReceipt/);
  assert.doesNotMatch(contract, /photo|filename/i);
  assert.match(contract, /previewPages/);
  assert.match(workflow, /"use workflow"/);
  assert.match(workflow, /"use step"/);
  assert.match(workflow, /PAGE_TRANSLATION_CONCURRENCY/);
  assert.match(workflow, /sendTranslationEmailStep\.maxRetries = 3/);
});

test("email-gate consent is separate, unchecked, and non-blocking", async () => {
  const page = await readFile(new URL("../app/translate/Translator.tsx", import.meta.url), "utf8");
  const teaserScreen = page.slice(page.indexOf("{step === 11"), page.indexOf("{step === 12"));
  assert.match(page, /const \[marketingConsent, setMarketingConsent\] = useState\(false\)/);
  assert.match(page, /const \[analyticsConsent, setAnalyticsConsentChoice\] = useState\(false\)/);
  assert.match(teaserScreen, /Send me occasional Bibaling news and product updates\./);
  assert.match(teaserScreen, /Allow anonymous usage analytics to help improve Bibaling\./);
  assert.doesNotMatch(teaserScreen, />Optional</);
  assert.match(teaserScreen, /disabled=\{emailRequest\.loading \|\| !validEmail\(email\)\}/);
  assert.doesNotMatch(
    teaserScreen.match(/disabled=\{emailRequest\.loading[\s\S]*?\}/)?.[0] || "",
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
    "sample_pages_uploaded",
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

test("a Resend Contacts failure does not block transactional delivery", async () => {
  const route = await readFile(new URL("../app/api/leads/route.ts", import.meta.url), "utf8");
  assert.match(route, /lead_contact_sync_failed/);
  assert.match(route, /contactSaved = false/);
  assert.ok(route.indexOf("resendLeadCaptureAdapter.capture") < route.indexOf("receipt: createLeadReceipt"));
  assert.doesNotMatch(
    route.slice(route.indexOf('console.error("lead_contact_sync_failed"'), route.indexOf("return NextResponse.json({")),
    /throw/
  );
});
