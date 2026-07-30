import type { Metadata } from "next";
import TranslateLink from "../components/TranslateLink";

export const metadata: Metadata = {
  title: "Languages",
  description: "Bibaling currently supports English children’s books translated into Slovenian.",
  alternates: { canonical: "/languages" }
};

export default function LanguagesPage() {
  return (
    <main className="content-page">
      <p className="eyebrow">Languages</p>
      <h1>English to Slovenian, thoughtfully.</h1>
      <p className="page-intro">Bibaling currently supports one language pair: English source books adapted into natural Slovenian for reading aloud.</p>
      <section className="language-card"><span>Available now</span><h2>English → Slovenian</h2><p>The workflow handles prose, poetic stories, and verse with a repeating refrain. Parents remain the final editors.</p></section>
      <section className="prose-section"><h2>What about other languages?</h2><p>Other family languages are an important future possibility. They are not available yet, and we will not present a language pair as supported until its prompts, quality checks, and parent workflow have been properly tested.</p></section>
      <TranslateLink className="site-cta large" />
    </main>
  );
}
