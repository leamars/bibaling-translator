import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Bibaling handles book material, email capture, optional marketing consent, and analytics.",
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <p className="eyebrow">Privacy</p>
      <h1>What data moves through Bibaling</h1>
      <p className="page-intro">This page describes the current implementation. It does not promise a retention period or deletion schedule that has not yet been established.</p>
      <h2>Book photos and translation content</h2><p>Bibaling runs on Vercel. Uploaded images, extracted text, parent corrections, selected preferences, feedback, and translation context are processed by the application and sent to OpenAI as needed to read and translate the book. They are not sent to Resend or GA4.</p>
      <h2>Email for the service</h2><p>After the complete three-page translated preview, an email address is required to continue into full-book translation. The server sends the normalized email, capture time, acquisition attribution, language pair, confirmed book form, and consent state to Resend Contacts. It does not send Resend book photos, filenames, text, translations, feedback, prompts, or model responses.</p>
      <h2>Marketing is optional</h2><p>The marketing checkbox is separate and unchecked by default. The contact is added to the configured marketing topic only when the parent explicitly opts in. Declining marketing does not block the translation service.</p>
      <h2>Analytics is optional</h2><p>GA4 remains disabled until the visitor explicitly allows anonymous analytics. The preference can be changed from the footer. When allowed, events use an anonymous session identifier and limited properties such as book form and language pair. GA4 never receives email, book content, images, filenames, feedback, prompts, or translation output.</p>
      <h2>Owner decisions required before production</h2><p>The service owner must still publish final decisions about the operating legal entity, contact address, provider-specific retention settings, user request procedures, and any jurisdiction-specific disclosures.</p>
      <p>Privacy questions: <a href="mailto:hello@bibaling.com">hello@bibaling.com</a></p>
    </main>
  );
}
