# Bibaling Book Translator

A parent-led workshop for turning an English picture book into a Slovenian
read-aloud adaptation the family will genuinely enjoy.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `OPENAI_API_KEY` in `.env.local`. The key is used only by server routes and
is never sent to the browser. The app includes reviewed standard-processing
prices for its known models; `.env.example` exposes optional pricing overrides.
Live requests are refused when their conservative estimate exceeds the
configured action budget or when they exceed the hard timeout.

## Safe interface testing

Set `BIBALING_MOCK_MODE=true` to exercise the complete interface without any
OpenAI request. Mock text is visibly marked and is never evidence of translation
quality.

```bash
npm test
npm run build
```

## Controlled prompt evaluation

`npm run live-eval:describe` prints the fixed image-free mushroom fixture, exact
generation request, evaluation template, prompt hash, model, reasoning setting,
candidate count, output caps, timeout, and confirmation phrase. It makes no API
request.

The live harness has one generation attempt, no SDK retry, one editorial
evaluation, deterministic pre-filtering, cost preflight, hard timeouts, and raw
artifact capture. It refuses to run without the explicit confirmation phrase.
Do not use it without immediate user approval; native-speaker review remains
mandatory.

## Current milestone

This first production foundation includes:

- progressive upload of the first three book spreads;
- vision-model transcription of each original image;
- editable source text and graceful failure without losing photos;
- one-choice translation priority;
- creative-freedom selection;
- responsive, parent-focused interface.

The Refrain Lab and Slovenian literary generation use server-side structured
generation plus an independent editorial quality gate.
