import type { LeadCapture, LeadCaptureAdapter, LeadCaptureResult } from "./contract";

const RESEND_CONTACTS_URL = "https://api.resend.com/contacts";
const RESEND_TIMEOUT_MS = 15_000;

function contactPayload(input: LeadCapture) {
  const properties = {
    capture_timestamp: input.capturedAt,
    marketing_consent: input.marketingConsent ? "granted" : "not_granted",
    marketing_consent_timestamp: input.marketingConsent ? input.capturedAt : "",
    source: input.attribution.source,
    medium: input.attribution.medium,
    campaign: input.attribution.campaign,
    content: input.attribution.content,
    term: input.attribution.term,
    original_landing_page: input.attribution.landingPage,
    language_pair: input.languagePair,
    confirmed_book_form: input.bookForm
  };
  const leadsSegmentId = process.env.RESEND_LEADS_SEGMENT_ID?.trim();
  if (!leadsSegmentId) {
    throw new Error("Resend leads segment is not configured.");
  }
  const topicId = process.env.RESEND_MARKETING_TOPIC_ID?.trim();
  if (input.marketingConsent && !topicId) {
    throw new Error("Resend marketing topic is not configured.");
  }
  return {
    properties,
    segments: [{ id: leadsSegmentId }],
    ...(input.marketingConsent && topicId
      ? { topics: [{ id: topicId, subscription: "opt_in" as const }] }
      : {})
  };
}

async function resendRequest(path: string, init: RequestInit, signal?: AbortSignal) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Resend is not configured.");
  const timeoutSignal = AbortSignal.timeout(RESEND_TIMEOUT_MS);
  return fetch(`${RESEND_CONTACTS_URL}${path}`, {
    ...init,
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
}

async function ensureMemberships(input: LeadCapture, signal?: AbortSignal) {
  const leadsSegmentId = process.env.RESEND_LEADS_SEGMENT_ID?.trim();
  if (!leadsSegmentId) throw new Error("Resend leads segment is not configured.");
  const contactPath = `/${encodeURIComponent(input.email)}`;
  const segment = await resendRequest(
    `${contactPath}/segments/${encodeURIComponent(leadsSegmentId)}`,
    { method: "POST" },
    signal
  );
  if (!segment.ok && segment.status !== 409) {
    throw new Error(`Resend segment assignment failed (${segment.status}).`);
  }
  if (!input.marketingConsent) return;
  const topicId = process.env.RESEND_MARKETING_TOPIC_ID?.trim();
  if (!topicId) throw new Error("Resend marketing topic is not configured.");
  const topic = await resendRequest(`${contactPath}/topics`, {
    method: "PATCH",
    body: JSON.stringify({ topics: [{ id: topicId, subscription: "opt_in" }] })
  }, signal);
  if (!topic.ok) throw new Error(`Resend marketing topic update failed (${topic.status}).`);
}

export const resendLeadCaptureAdapter: LeadCaptureAdapter = {
  async capture(input, signal): Promise<LeadCaptureResult> {
    const payload = contactPayload(input);
    const update = await resendRequest(`/${encodeURIComponent(input.email)}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: payload.properties })
    }, signal);
    if (update.ok) {
      const data = await update.json() as { id?: string };
      await ensureMemberships(input, signal);
      return { contactId: data.id || "existing-contact", created: false };
    }
    if (update.status !== 404) {
      throw new Error(`Resend contact update failed (${update.status}).`);
    }
    const create = await resendRequest("", {
      method: "POST",
      body: JSON.stringify({ email: input.email, ...payload })
    }, signal);
    if (create.status === 409) {
      const retry = await resendRequest(`/${encodeURIComponent(input.email)}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: payload.properties })
      }, signal);
      if (!retry.ok) throw new Error(`Resend duplicate contact update failed (${retry.status}).`);
      const data = await retry.json() as { id?: string };
      await ensureMemberships(input, signal);
      return { contactId: data.id || "existing-contact", created: false };
    }
    if (!create.ok) throw new Error(`Resend contact creation failed (${create.status}).`);
    const data = await create.json() as { id?: string };
    if (!data.id) throw new Error("Resend did not confirm the contact.");
    return { contactId: data.id, created: true };
  }
};

export { contactPayload };
