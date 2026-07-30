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
        <div className="hero-copy">
          <p className="eyebrow">The books they love, in the language you share</p>
          <h1>Turn favorite books into stories that sound like home.</h1>
          <p>Bibaling shapes the children’s books you already have into warm, natural read-aloud language—not stiff word-for-word translation.</p>
          <TranslateLink className="site-cta large" />
        </div>
        <div className="hero-visual" aria-hidden="true">
          <img src="/bibaling-family-reading.png" alt="" />
          <span className="word-ribbon ribbon-one">once upon a time · nekoč · once upon a time</span>
          <span className="word-ribbon ribbon-two">read · imagine · share</span>
        </div>
      </section>

      <section className="home-section steps-section">
        <p className="eyebrow">Three thoughtful steps</p>
        <h2>Start with the voice. Then carry it through the book.</h2>
        <div className="steps-grid">
          {[
            ["01", "Photograph the whole book.", "Add every page in reading order. We read the words, and you correct anything we missed."],
            ["02", "Choose the voice that feels right.", "Compare real Slovenian options, edit the strongest one, and tell us what felt off."],
            ["03", "Finish the whole book.", "After you approve Page 1 and provide an email, we translate, review, and send the complete book."]
          ].map(([number, title, text]) => (
            <article className="feature-card" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>
          ))}
        </div>
      </section>

      <section className="home-section example-section story-swoop">
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
          <article className="form-card prose-form"><span>Story</span><h3>Stories without rhyme</h3><p>Protect the storytelling voice, events, emotional beats, and picture details without inventing verse.</p></article>
          <article className="form-card poetry-form"><span>Poem</span><h3>Rhyming or poetic stories</h3><p>Preserve the source’s cadence, line shape, sound play, and rhyme where it truly belongs.</p></article>
          <article className="form-card refrain-form"><span>Refrain</span><h3>Verse with a repeating refrain</h3><p>Solve the recurring line with the parent first, then use its exact approved wording throughout.</p></article>
        </div>
      </section>

      <section className="home-section privacy-callout">
        <p className="eyebrow">Your family’s reading project</p>
        <h2>Made for bilingual families, not publishers.</h2>
        <p>Book photos are used to read the source pages, but only corrected text—not photos—is placed in the durable translation job. After Page 1 is visible, your email is sent separately to Resend so we can send the finished book. Marketing and GA4 analytics are optional, and analytics never receives your email or book content.</p>
      </section>

      <section className="home-section faq">
        <p className="eyebrow">A few useful answers</p>
        <h2>Before you photograph the first page</h2>
        <details><summary>Which languages work today?</summary><p>The current translator supports English to Slovenian. Other language pairs are future possibilities, not available features.</p></details>
        <details><summary>Can I correct the translation?</summary><p>Yes. You correct the extracted English, then choose and edit the Page 1 Slovenian voice before the rest of the book is translated.</p></details>
        <details><summary>When do you ask for email?</summary><p>Only after you upload the whole book, shape its voice, and see the completed Page 1 translation options. We use the address to send the finished translation.</p></details>
        <details><summary>Is the output guaranteed to be perfect?</summary><p>No. Machine-assisted translations can contain errors. A parent should review every page before using it.</p></details>
      </section>

      <section className="final-cta">
        <h2>Find a voice that feels like your family.</h2>
        <TranslateLink className="site-cta large" />
      </section>
    </main>
  );
}
