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
          <div>
            <strong>Help us improve Bibaling?</strong>
            <p>Allow anonymous GA4 usage analytics. We never send email, book content, images, filenames, feedback, or translations to analytics.</p>
          </div>
          <div className="consent-actions">
            <button type="button" className="secondary" onClick={() => choose(false)}>No thanks</button>
            <button type="button" className="primary" onClick={() => choose(true)}>Allow analytics</button>
          </div>
        </aside>
      )}
    </>
  );
}
