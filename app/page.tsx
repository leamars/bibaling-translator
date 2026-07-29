import type { Metadata } from "next";
import TranslateLink from "./components/TranslateLink";

export const metadata: Metadata = {
  title: "Read favorite books in your family’s language",
  description: "Turn children’s books you already have into natural read-aloud stories for bilingual family life.",
  alternates: { canonical: "/" }
};

export default function LandingPage() {
  return (
    <main className="marketing-page">
      <section className="hero">
        <p className="eyebrow">The books they love, in the language you share</p>
        <h1>Turn the children’s books you already have into stories you can read naturally in your family’s language.</h1>
        <p>Bibaling helps you shape a warm read-aloud adaptation—not a stiff word-for-word translation.</p>
        <TranslateLink className="site-cta large" />
      </section>

      <section className="home-section">
        <p className="eyebrow">Three thoughtful steps</p>
        <h2>Start with the voice. Then carry it through the book.</h2>
        <div className="steps-grid">
          {[
            ["01", "Photograph a few pages.", "We read the words and pictures together. You correct anything we missed."],
            ["02", "Choose the voice that feels right.", "Compare real Slovenian options, edit the strongest one, and tell us what felt off."],
            ["03", "Translate the rest of the book.", "Add the remaining pages, put them in order, and review the full editable draft."]
          ].map(([number, title, text]) => (
            <article className="feature-card" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>
          ))}
        </div>
      </section>

      <section className="home-section example-section">
        <div>
          <p className="eyebrow">More than substituting words</p>
          <h2>A translation can be correct and still feel wrong aloud.</h2>
          <p>Picture books depend on timing: a rhyme lands with a page turn, a joke matches the illustration, or a phrase returns until a child can join in. Bibaling lets the parent choose which qualities matter, then review the language that will actually be read.</p>
        </div>
        <div className="comparison">
          <article><span>Word for word</span><p>Meaning arrives, but English syntax, flat rhythm, or a lost joke can make the sentence feel translated.</p></article>
          <article className="preferred"><span>Shaped for reading aloud</span><p>The same story beat is expressed in natural Slovenian, with rhythm, wordplay, and repetition handled according to the book.</p></article>
        </div>
      </section>

      <section className="home-section">
        <p className="eyebrow">The book decides the approach</p>
        <h2>Not every picture book is a rhyming poem.</h2>
        <div className="forms-grid">
          <article><h3>Stories without rhyme</h3><p>Protect the storytelling voice, events, emotional beats, and picture details without inventing verse.</p></article>
          <article><h3>Rhyming or poetic stories</h3><p>Preserve the source’s cadence, line shape, sound play, and rhyme where it truly belongs.</p></article>
          <article><h3>Verse with a repeating refrain</h3><p>Solve the recurring line with the parent first, then use its exact approved wording throughout.</p></article>
        </div>
      </section>

      <section className="home-section privacy-callout">
        <p className="eyebrow">Your family’s reading project</p>
        <h2>Made for bilingual families, not publishers.</h2>
        <p>Book photos and text are sent to OpenAI to read and translate them. Your email is sent separately to Resend only after the complete three-page preview. Marketing and GA4 analytics are optional, and analytics never receives your email or book content.</p>
      </section>

      <section className="home-section faq">
        <p className="eyebrow">A few useful answers</p>
        <h2>Before you photograph the first page</h2>
        <details><summary>Which languages work today?</summary><p>The current translator supports English to Slovenian. Other language pairs are future possibilities, not available features.</p></details>
        <details><summary>Can I correct the translation?</summary><p>Yes. You can correct extracted English, choose and edit Slovenian options, leave feedback, and revise the full draft.</p></details>
        <details><summary>When do you ask for email?</summary><p>Only after you have seen the complete translated three-page preview, before adding the rest of the book.</p></details>
        <details><summary>Is the output guaranteed to be perfect?</summary><p>No. Machine-assisted translations can contain errors. A parent should review every page before using it.</p></details>
      </section>

      <section className="final-cta">
        <h2>Find a voice that feels like your family.</h2>
        <TranslateLink className="site-cta large" />
      </section>
    </main>
  );
}
