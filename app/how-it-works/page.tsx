import type { Metadata } from "next";
import TranslateLink from "../components/TranslateLink";

export const metadata: Metadata = {
  title: "How it works",
  description: "See how Bibaling builds a three-page preview, learns the parent-approved voice, and translates the remaining book.",
  alternates: { canonical: "/how-it-works" }
};

export default function HowItWorksPage() {
  return (
    <main className="content-page">
      <p className="eyebrow">How it works</p>
      <h1>Choose the voice before translating the whole book.</h1>
      <p className="page-intro">Bibaling begins with three pages so you can correct the source, compare real language, and decide what “right” sounds like before committing to the rest.</p>
      <div className="process-list">
        {[
          ["Photograph three open spreads", "Upload clear photos that show both facing pages. Bibaling extracts the English and uses the pictures as context."],
          ["Correct what we read", "The extracted English is fully editable. Your correction becomes the source for the Slovenian version."],
          ["Confirm the book form", "Choose prose, continuous verse, or verse with a repeating refrain. Refrain books solve that recurring wording first."],
          ["Establish the voice on Page 1", "Choose one of three Slovenian possibilities, edit it directly, and leave an optional note explaining your changes."],
          ["Test Pages 2 and 3", "Generate two more pages, select the versions that belong together, and review the complete sample."],
          ["Continue after the preview", "Enter an email to preserve the lead and unlock remaining-page upload. Marketing and analytics choices remain optional."],
          ["Arrange, generate, and review", "Put every page in order. Finished translations appear one page at a time and remain editable."]
        ].map(([title, text], index) => (
          <article key={title}><span>{index + 1}</span><div><h2>{title}</h2><p>{text}</p></div></article>
        ))}
      </div>
      <TranslateLink className="site-cta large" />
    </main>
  );
}
