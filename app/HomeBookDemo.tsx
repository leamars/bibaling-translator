"use client";

import { useState } from "react";

const translations = [
  {
    language: "Español",
    shortLabel: "ES",
    lines: [
      "Zorrito, la luna ya brilló.",
      "Y nuestro día al fin terminó.",
      "Cierra los ojos, mi corazón.",
      "Mañana vuelve la diversión."
    ]
  },
  {
    language: "Slovenščina",
    shortLabel: "SL",
    lines: [
      "Mali lisjak, luna sije.",
      "Dan se tiho v noč zavije.",
      "Zapri oči, naj pridejo sanje.",
      "Jutri spet čaka naju igranje."
    ]
  },
  {
    language: "Deutsch",
    shortLabel: "DE",
    lines: [
      "Kleiner Fuchs, der Mond erwacht.",
      "Leise wird der Tag zur Nacht.",
      "Mach die Augen zu, mein Schatz.",
      "Morgen gibt’s für Spiele Platz."
    ]
  }
] as const;

const englishLines = [
  "Little fox, the moon shines bright.",
  "Day slips softly into night.",
  "Close your eyes and dream away.",
  "We’ll have more fun another day."
] as const;

export default function HomeBookDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const translation = translations[activeIndex];

  function move(direction: number) {
    setActiveIndex(
      (current) =>
        (current + direction + translations.length) % translations.length
    );
  }

  return (
    <>
      <div className="open-book">
        <article className="book-page book-page-left">
          <div className="page-topline">
            <span>English</span>
            <span className="page-number">12</span>
          </div>
          <div className="page-moon" aria-hidden="true">
            <span />
            <i />
            <i />
          </div>
          <p className="story-lines">
            {englishLines.map((line, index) =>
              index % 2 === 0 ? (
                <span key={line}>{line}</span>
              ) : (
                <strong key={line}>{line}</strong>
              )
            )}
          </p>
        </article>

        <div className="book-fold" aria-hidden="true" />

        <article
          className="book-page book-page-right page-turn"
          key={translation.language}
          aria-live="polite"
        >
          <div className="page-topline">
            <span>{translation.language}</span>
            <span className="page-number">13</span>
          </div>
          <div className="page-ball" aria-hidden="true">
            <span />
            <i />
          </div>
          <p className="story-lines">
            {translation.lines.map((line, index) =>
              index % 2 === 0 ? (
                <span key={line}>{line}</span>
              ) : (
                <strong key={line}>{line}</strong>
              )
            )}
          </p>
        </article>
      </div>

      <div className="book-language-picker" aria-label="Choose a translation">
        <button
          className="book-page-arrow"
          type="button"
          onClick={() => move(-1)}
          aria-label="Show previous language"
        >
          ←
        </button>
        <div
          className="language-tabs"
          role="group"
          aria-label="Translation language"
        >
          {translations.map((option, index) => (
            <button
              className={index === activeIndex ? "is-active" : ""}
              type="button"
              key={option.language}
              onClick={() => setActiveIndex(index)}
              aria-pressed={index === activeIndex}
              aria-label={`Show the ${option.language} translation`}
            >
              <span aria-hidden="true">{option.shortLabel}</span>
              {option.language}
            </button>
          ))}
        </div>
        <button
          className="book-page-arrow"
          type="button"
          onClick={() => move(1)}
          aria-label="Show next language"
        >
          →
        </button>
      </div>

      <p className="spread-caption">
        Different words. The same playful rhythm.
      </p>
    </>
  );
}
