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
      <p className="page-intro">Add the complete book first. Bibaling uses three pages to understand its form, then translates Page 1 so you can decide what “right” sounds like before the full book is finished.</p>
      <div className="process-list">
        {[
          ["Photograph the whole book", "Upload clear photos of every open spread in reading order. Bibaling extracts the English and uses the pictures as context while you are present."],
          ["Correct what we read", "The extracted English is fully editable. Your correction becomes the source for your chosen language."],
          ["Confirm the book form", "Choose prose, continuous verse, or verse with a repeating refrain. Refrain books solve that recurring wording first."],
          ["Establish the voice on Page 1", "Choose one of three possibilities in your family’s language, edit it directly, and leave an optional note explaining your changes."],
          ["Choose Page 1 and add an email", "Select or edit the Page 1 voice, then provide the address where the finished translation should be sent. Marketing and analytics choices remain separate and unchecked."],
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
