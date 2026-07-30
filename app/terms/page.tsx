import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "Service limitations and responsibilities when using Bibaling.",
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <p className="eyebrow">Terms</p>
      <h1>Use Bibaling as a parent-reviewed aid</h1>
      <p className="page-intro">These terms are a practical pre-launch summary and require final legal review and owner decisions before production.</p>
      <h2>The service</h2><p>Bibaling provides machine-assisted extraction and translation tools for family reading projects. Features may be unavailable, interrupted, or changed, and generated output is not guaranteed to be complete or error-free.</p>
      <h2>Your responsibility</h2><p>You are responsible for checking extracted text and every translation before reading, printing, or otherwise using it. Do not rely on Bibaling for safety-critical, legal, medical, or other high-stakes translation.</p>
      <h2>Permitted material</h2><p>Upload only material you have the right to use. Do not upload unlawful, abusive, privacy-invasive, or harmful content, attempt to bypass service controls, interfere with the service, or use it to facilitate unauthorized publication or distribution.</p>
      <h2>No publication rights</h2><p>Bibaling does not transfer ownership of source material and does not grant rights to publish, sell, distribute, or commercially exploit a source book or generated translation.</p>
      <h2>Owner decisions required before production</h2><p>The final terms still require the service owner’s legal name, governing-law and dispute terms, age/guardian requirements, liability language, effective date, and change-notice process.</p>
      <p>Questions: <a href="mailto:hello@bibaling.com">hello@bibaling.com</a></p>
    </main>
  );
}
