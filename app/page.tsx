import type { Metadata } from "next";
import Image from "next/image";
import AnalyticsPreference from "./components/AnalyticsPreference";
import TranslateLink from "./components/TranslateLink";
import HomeBookDemo from "./HomeBookDemo";

export const metadata: Metadata = {
  title: "Read their favourite books in your language",
  description:
    "Bibaling translates the children’s books you already have, keeping the rhythm, rhyme and playfulness that make them fun to read aloud.",
  alternates: { canonical: "/" }
};

const storyWords = [
  "once upon a time",
  "érase una vez",
  "es war einmal",
  "c’era una volta",
  "il était une fois",
  "der var engang",
  "era uma vez",
  "er was eens",
  "pewnego razu",
  "det var en gång",
  "a fost odată",
  "nekoč",
  "ROAR!",
  "¡GRRR!",
  "hoppla!",
  "pluf!"
];

function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path
        d="M5 12h13M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function Spark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 62 62">
      <path
        d="M31 2c2 19 10 27 29 29-19 2-27 10-29 29-2-19-10-27-29-29C21 29 29 21 31 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Brand() {
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>Bibaling</span>
    </>
  );
}

export default function LandingPage() {
  return (
    <main className="bibaling-home">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Bibaling home">
          <Brand />
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#why">Why Bibaling</a>
          <a href="#translation">See it</a>
          <a href="#how">How it works</a>
          <a href="#questions">Questions</a>
        </nav>

        <TranslateLink className="button button-small">
          Translate your book
          <Arrow />
        </TranslateLink>
      </header>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Made for bilingual families
          </span>
          <h1>
            Read their
            <br />
            favourite books
            <br />
            in your language.
          </h1>
          <p className="hero-description">
            Bibaling translates the children&apos;s books you already have,
            keeping the rhythm, rhyme and playfulness that make them fun to
            read aloud.
          </p>
          <TranslateLink className="button button-primary">
            Translate your book
            <Arrow />
          </TranslateLink>
          <p className="language-note">
            <span aria-hidden="true">●</span> Across European languages
          </p>
        </div>

        <div className="hero-art">
          <span className="orbit-word orbit-word-one">hop!</span>
          <span className="orbit-word orbit-word-two">ššš...</span>
          <Spark className="hero-spark hero-spark-one" />
          <Spark className="hero-spark hero-spark-two" />
          <div className="hero-image-wrap">
            <Image
              alt="A happy mother and young child discovering a story together"
              src="/images/hero-family.webp"
              width={1536}
              height={1024}
              priority
            />
          </div>
          <div className="floating-page floating-page-left" aria-hidden="true">
            <span>Once upon</span>
            <i />
            <i />
          </div>
          <div className="floating-page floating-page-right" aria-hidden="true">
            <span>Érase una vez</span>
            <i />
            <i />
          </div>
        </div>
      </section>

      <section className="bedtime-band" id="why">
        <div className="section-shell bedtime-inner">
          <div>
            <span className="eyebrow eyebrow-light">The real magic trick</span>
            <h2>
              We handle the translation.
              <br />
              You handle bedtime.
            </h2>
          </div>
          <div className="pain-points" aria-label="What Bibaling helps with">
            <span>No searching for words.</span>
            <span>No losing the rhyme.</span>
            <span>No inventing a different version every night.</span>
          </div>
        </div>
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {[0, 1].map((loop) => (
              <span className="marquee-set" key={loop}>
                {storyWords.map((word, index) => (
                  <span className="marquee-word" key={`${loop}-${word}`}>
                    {word}
                    {index < storyWords.length - 1 && <i>•</i>}
                  </span>
                ))}
                <i>•</i>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section
        className="translation-section section-shell"
        id="translation"
      >
        <div className="section-heading centered">
          <span className="eyebrow">See the difference</span>
          <h2>Finding the right words is hard.</h2>
          <p>
            A literal translation can lose the rhyme, rhythm and fun. Bibaling
            finds words that work when you read them aloud.
          </p>
        </div>

        <div className="book-stage">
          <Spark className="book-spark book-spark-one" />
          <Spark className="book-spark book-spark-two" />
          <span className="book-doodle book-doodle-one" aria-hidden="true">
            A
          </span>
          <span className="book-doodle book-doodle-two" aria-hidden="true">
            Ñ
          </span>
          <HomeBookDemo />
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-shell">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">How it works</span>
              <h2>
                From your bookshelf
                <br />
                to your language.
              </h2>
            </div>
            <p>
              No blank page. No translation project. Start with a book your
              child already reaches for.
            </p>
          </div>

          <div className="steps">
            <article className="step step-coral">
              <span className="step-number">1</span>
              <div className="step-icon camera-icon" aria-hidden="true">
                <span />
                <i />
              </div>
              <h3>Photograph the pages.</h3>
              <p>Clear phone photos are all you need.</p>
            </article>

            <div className="step-connector" aria-hidden="true">
              <span>hop</span>
            </div>

            <article className="step step-blue">
              <span className="step-number">2</span>
              <div className="step-icon page-icon" aria-hidden="true">
                <span>Mm</span>
                <i />
              </div>
              <h3>Make the first page yours.</h3>
              <p>
                Read it aloud. Tweak the words until they sound right to you.
              </p>
            </article>

            <div
              className="step-connector step-connector-two"
              aria-hidden="true"
            >
              <span>hop</span>
            </div>

            <article className="step step-green">
              <span className="step-number">3</span>
              <div className="step-icon book-icon" aria-hidden="true">
                <span />
                <i />
              </div>
              <h3>Your whole book. In your language.</h3>
              <p>
                We carry that voice, rhythm and playfulness through every page.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="family-section section-shell">
        <div className="family-statement">
          <span className="eyebrow">That&apos;s the whole point</span>
          <h2>
            For bilingual families.
            <br />
            <em>Not publishers.</em>
          </h2>
          <p>
            For the book already beside the bed. For the language you want your
            child to hear. For reading together—not making a perfect commercial
            edition.
          </p>
        </div>

        <aside className="privacy-note">
          <span className="tape" aria-hidden="true" />
          <span className="privacy-icon" aria-hidden="true">
            ♥
          </span>
          <h3>Your family&apos;s bookshelf stays yours.</h3>
          <p>
            Your photos and book pages are used only to create your
            family&apos;s translation.
          </p>
          <a href="/privacy">
            Read about privacy <Arrow />
          </a>
        </aside>
      </section>

      <section className="faq-section" id="questions">
        <div className="section-shell faq-grid">
          <div className="faq-heading">
            <span className="eyebrow">Good questions</span>
            <h2>
              Before you
              <br />
              grab a book.
            </h2>
            <p>The useful things to know before you get started.</p>
          </div>

          <div className="faq-list">
            <details>
              <summary>What kinds of books work well?</summary>
              <p>
                Picture-book stories, rhyming books, poems and books with a
                repeating refrain. Bibaling first works out what makes the book
                work, then translates it in the right way.
              </p>
            </details>
            <details>
              <summary>Which languages can I use?</summary>
              <p>
                All European languages. Choose the language on the page and the
                language your family reads in—from Spanish, Italian and German
                to Danish, Polish, Greek, Slovenian and more.
              </p>
            </details>
            <details>
              <summary>Is it a word-for-word translation?</summary>
              <p>
                No. A literal translation can flatten the rhyme, rhythm, jokes
                and nonsense. Bibaling keeps the meaning, but reshapes the words
                when it needs to so the page works aloud.
              </p>
            </details>
            <details>
              <summary>What happens to my book photos?</summary>
              <p>
                They&apos;re only used to read the pages and create your
                translation.
              </p>
            </details>
            <details>
              <summary>Can I translate any book I own?</summary>
              <p>
                Bibaling is for private family reading. You should only upload
                material you have the right to use; a translation does not give
                you permission to publish, sell or distribute the book.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="final-cta section-shell">
        <div className="final-copy">
          <span className="eyebrow eyebrow-light">Ready when you are</span>
          <h2>
            Their favourite.
            <br />
            In your language.
          </h2>
          <p>Pick the book they always ask for.</p>
          <TranslateLink className="button button-light">
            Translate your book
            <Arrow />
          </TranslateLink>
        </div>
        <div className="final-image">
          <Image
            alt="A father and a different child happily reading together at bedtime"
            src="/images/bedtime-reading.webp"
            width={1536}
            height={1024}
          />
        </div>
      </section>

      <footer>
        <div className="section-shell footer-inner">
          <div className="footer-brand">
            <a className="brand brand-footer" href="#top">
              <Brand />
            </a>
            <p>
              More stories. More of your language.
              <br />
              More reading together.
            </p>
          </div>
          <div className="footer-links">
            <div>
              <span>Explore</span>
              <a href="#why">Why Bibaling</a>
              <a href="#translation">See it</a>
              <a href="#how">How it works</a>
              <a href="#questions">Questions</a>
            </div>
            <div>
              <span>More</span>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/copyright">Copyright</a>
              <a href="mailto:hello@bibaling.com">Contact</a>
              <AnalyticsPreference />
            </div>
          </div>
        </div>
        <div className="section-shell footer-bottom">
          <span>© 2026 Bibaling</span>
          <span>
            Made with love{" "}
            <span className="footer-heart" aria-hidden="true">
              ♥
            </span>{" "}
            for bilingual families.
          </span>
        </div>
      </footer>
    </main>
  );
}
