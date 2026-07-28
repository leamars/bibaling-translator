# Bibaling Book Translator

A parent-led workshop for turning an English picture book into a Slovenian
read-aloud adaptation the family will genuinely enjoy.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `OPENAI_API_KEY` in `.env.local` to enable image transcription. The key is
used only by the server route and is never sent to the browser.

## Current milestone

This first production foundation includes:

- progressive upload of the first three book spreads;
- vision-model transcription of each original image;
- editable source text and graceful failure without losing photos;
- one-choice translation priority;
- creative-freedom selection;
- responsive, parent-focused interface.

The Refrain Lab and Slovenian literary generation are the next milestone.
