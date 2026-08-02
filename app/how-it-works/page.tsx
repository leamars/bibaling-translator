import type { Metadata } from "next";
import TranslateLink from "../components/TranslateLink";

export const metadata: Metadata = {
  title: "How it works",
  description: "See how Bibaling learns a parent-approved voice on Page 1, then translates and emails the whole book.",
  alternates: { canonical: "/how-it-works" }
};

export default function HowItWorksPage() {
  return (
    <main className="content-page">
      <p className="eyebrow">How it works</p>
      <h1>Choose the voice before translating the whole book.</h1>
      <p className="page-intro">Start with any three samples to establish the right voice. Then add and arrange the complete book before Bibaling shows that voice carrying into Page 4.</p>
      <div className="process-list">
        {[
          ["Start with three samples", "Upload any three clear open-spread photos. Bibaling extracts the English and uses them to establish the voice before asking for the rest."],
          ["Correct what we read", "The extracted English is fully editable. Your correction becomes the source for your chosen language."],
          ["Confirm the book form", "Choose prose, continuous verse, or verse with a repeating refrain. Refrain books solve that recurring wording first."],
          ["Establish the voice on Sample 1", "Choose one of three possibilities in your family’s language, edit it directly, and leave an optional note explaining your changes."],
          ["Arrange the complete book", "Tune all three samples, upload the remaining photos, and drag every photo into reading order."],
          ["Approve the voice across four pages", "See the approved sample voice carry into a completed Page 4 translation."],
          ["Continue from Page 5", "As the next page begins, provide the address where the finished translation should be sent. Marketing and analytics choices remain separate and unchecked."],
          ["We finish it durably", "Each remaining page is translated in a durable job, then the complete book receives a final consistency review. Closing the browser does not cancel the work."],
          ["Receive the translation", "The completed, page-ordered translation is sent as a transactional email, regardless of whether you opted into marketing."]
        ].map(([title, text], index) => (
          <article key={title}><span>{index + 1}</span><div><h2>{title}</h2><p>{text}</p></div></article>
        ))}
      </div>
      <TranslateLink className="site-cta large" />
    </main>
  );
}
