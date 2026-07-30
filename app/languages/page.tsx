import type { Metadata } from "next";
import TranslateLink from "../components/TranslateLink";

export const metadata: Metadata = {
  title: "Languages",
  description: "Translate English children’s books into Slovenian and additional languages spoken across Europe.",
  alternates: { canonical: "/languages" }
};

export default function LanguagesPage() {
  return (
    <main className="content-page">
      <p className="eyebrow">Languages</p>
      <h1>English books, in your family’s language.</h1>
      <p className="page-intro">Source books are English-only for now. Slovenian is our reviewed reference language, with Spanish, German, Italian, Croatian, and Serbian prioritized for hands-on evaluation.</p>
      <section className="language-card"><span>Reviewed reference</span><h2>Slovenian</h2><p>The existing prose, poetic-story, and repeating-refrain workflow remains intact.</p></section>
      <section className="language-card"><span>Evaluation languages</span><h2>Spanish, German, Italian, Croatian, and Serbian</h2><p>These language packs have independent drafting and editorial guidance and are ready for parent feedback.</p></section>
      <section className="language-card"><span>Experimental</span><h2>More languages spoken across Europe</h2><p>Additional languages are available with a gentle experimental label and an easy way to tell us what should improve.</p></section>
      <section className="prose-section"><h2>What about other languages?</h2><p>Other family languages are an important future possibility. They are not available yet, and we will not present a language pair as supported until its prompts, quality checks, and parent workflow have been properly tested.</p></section>
      <TranslateLink className="site-cta large" />
    </main>
  );
}
