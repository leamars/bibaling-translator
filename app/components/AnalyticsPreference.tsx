"use client";

import { useEffect, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent } from "../analytics";

export default function AnalyticsPreference() {
  const [choice, setChoice] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setChoice(getAnalyticsConsent());
    sync();
    window.addEventListener("bibaling:analytics-consent", sync);
    return () => window.removeEventListener("bibaling:analytics-consent", sync);
  }, []);

  function choose(value: boolean) {
    setAnalyticsConsent(value);
    setChoice(value);
    setOpen(false);
  }

  return (
    <>
      <button className="footer-preference" type="button" onClick={() => setOpen(true)}>
        Analytics preferences{choice === null ? "" : choice ? " · allowed" : " · declined"}
      </button>
      {(open || choice === null) && (
        <aside className="consent-banner" aria-label="Analytics preference">
          <div className="consent-copy">
            <span className="consent-kicker">Your privacy</span>
            <strong>Help us improve Bibaling?</strong>
            <p>Allow anonymous usage analytics. We never share your email, book photos, words, or translations with analytics.</p>
          </div>
          <div className="consent-actions">
            <button type="button" className="consent-decline" onClick={() => choose(false)}>No thanks</button>
            <button type="button" className="consent-accept" onClick={() => choose(true)}>Allow analytics</button>
          </div>
        </aside>
      )}
    </>
  );
}
