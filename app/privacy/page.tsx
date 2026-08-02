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
      <p className="page-intro">This page describes the current implementation and the limits of the controls currently available to this small project.</p>
      <h2>Book photos and translation content</h2><p>Bibaling runs on Vercel. Uploaded images are sent to OpenAI to read the pages, but they are not stored in the durable full-book job. The durable Vercel Workflow contains only corrected source text, the selected book form and constraints, the approved Page 1 voice, recipient email, and job state. OpenAI receives the corrected text needed for translation. Resend receives the completed translation only when sending the transactional delivery email. GA4 receives none of this content.</p>
      <h2>Email for the service</h2><p>After three sample pages are approved, the remaining book is uploaded and arranged, and Page 4’s completed translation is visible, an email address is required so Bibaling can finish and send the book. Resend Contacts may receive the normalized email, capture time, acquisition attribution, language pair, confirmed book form, and consent state; a temporary Contacts failure does not block the requested book delivery. Resend Email receives the address and final translation for transactional delivery. It does not receive photos, filenames, prompts, model responses, or signed job receipts.</p>
      <h2>Retention and deletion</h2><p>Bibaling does not create a separate book-content database or retain source photos in the delivery workflow. The encrypted Workflow event record and provider processing records remain subject to Vercel, OpenAI, and Resend’s own retention controls. The currently installed stable Vercel Workflow API does not provide Bibaling with a per-run deletion or configurable expiry API, so this release cannot promise automatic deletion after a specific number of days. To request deletion of a Resend contact or ask about a workflow record, email <a href="mailto:hello@bibaling.com">hello@bibaling.com</a>. A defined provider-retention policy remains an owner decision before production.</p>
      <h2>Marketing is optional</h2><p>The marketing checkbox is separate and unchecked by default. The contact is added to the configured marketing topic only when the parent explicitly opts in. Declining marketing does not block the translation service.</p>
      <h2>Analytics is optional</h2><p>GA4 remains disabled until the visitor explicitly allows anonymous analytics. The preference can be changed from the footer. When allowed, events contain only low-cardinality properties such as book form and language pair. GA4 never receives email, book content, images, filenames, feedback, prompts, translation output, Resend identifiers, or signed receipts.</p>
      <h2>Owner decisions required before production</h2><p>The service owner must still publish final decisions about the operating legal entity, contact address, provider-specific retention settings, user request procedures, and any jurisdiction-specific disclosures.</p>
      <p>Privacy questions: <a href="mailto:hello@bibaling.com">hello@bibaling.com</a></p>
    </main>
  );
}
