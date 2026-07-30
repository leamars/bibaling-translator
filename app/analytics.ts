"use client";

export type FunnelEventName =
  | "translator_opened"
  | "all_photos_uploaded"
  | "first_page_generation_started"
  | "first_page_translation_displayed"
  | "email_gate_displayed"
  | "generate_lead"
  | "remaining_translation_started"
  | "delivery_succeeded"
  | "delivery_failed";

export type FunnelEvent = {
  name: FunnelEventName;
  params: {
    book_form?: "prose_story" | "continuous_verse" | "refrain_verse";
    language_pair: string;
  };
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const QUEUE_KEY = "bibaling_analytics_queue";
const SENT_KEY = "bibaling_analytics_sent";
const CONSENT_KEY = "bibaling_analytics_consent";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-EK8PPEVG54";

function readList<T>(key: string): T[] {
  try { return JSON.parse(sessionStorage.getItem(key) || "[]") as T[]; } catch { return []; }
}

function configured() {
  return Boolean(GA_MEASUREMENT_ID);
}

function consented() {
  return localStorage.getItem(CONSENT_KEY) === "granted";
}

export function getAnalyticsConsent(): boolean | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(CONSENT_KEY);
  return value === "granted" ? true : value === "denied" ? false : null;
}

function send(event: FunnelEvent) {
  if (!configured() || !consented() || !window.gtag) return;
  window.gtag("event", event.name, event.params);
}

function ensureTag() {
  const id = GA_MEASUREMENT_ID;
  if (!id || document.querySelector(`script[data-bibaling-ga="${id}"]`)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.dataset.bibalingGa = id;
  document.head.appendChild(script);
  window.gtag("js", new Date());
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("config", id, { send_page_view: false });
}

export function setAnalyticsConsent(granted: boolean) {
  localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  window.dispatchEvent(new Event("bibaling:analytics-consent"));
  if (!granted) {
    window.gtag?.("consent", "update", { analytics_storage: "denied" });
    return;
  }
  if (!configured()) return;
  ensureTag();
  const queue = readList<FunnelEvent>(QUEUE_KEY);
  queue.forEach(send);
  sessionStorage.setItem(QUEUE_KEY, "[]");
}

export function trackFunnelEventOnce(
  name: FunnelEventName,
  context: { bookForm?: FunnelEvent["params"]["book_form"]; languagePair: string }
) {
  const sent = new Set(readList<FunnelEventName>(SENT_KEY));
  if (sent.has(name)) return;
  sent.add(name);
  sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent]));
  const event: FunnelEvent = {
    name,
    params: {
      book_form: context.bookForm,
      language_pair: context.languagePair
    }
  };
  if (configured() && consented()) {
    ensureTag();
    send(event);
  } else {
    const queue = readList<FunnelEvent>(QUEUE_KEY);
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, event]));
  }
}
