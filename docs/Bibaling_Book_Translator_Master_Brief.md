# Bibaling Book Translator — Master Project Brief

_Consolidated 28 July 2026 from the prior Bibaling translator work._

## 1. What we are building

**Bibaling Book Workshop** helps a parent turn an English picture book they own into a beautiful Slovenian read-aloud adaptation for private family use.

This is not a one-click translator. The core promise is:

> We write your family’s version together.

The model proposes strong literary possibilities. The parent supplies taste, native-speaker judgment, family language, and final approval. The collaborative writing process is the product.

The experience should feel like working beside a warm, skilled children’s-book editor—not operating translation software and not chatting with a generic assistant.

## 2. Product principles

1. **Write for reading aloud.** Natural spoken Slovenian, rhythm, warmth, and repeatability matter more than literal equivalence.
2. **The parent is the editor.** Native-speaker feedback about rhythm, rhyme, word choice, and naturalness is authoritative.
3. **Establish the book’s voice before scaling.** Workshop the first three spreads, lock a refrain or recurring structure, and use the approved pages as the voice reference for the rest.
4. **Images matter.** The translation should preserve the visible event, emotional beat, relevant picture details, and approximate text density.
5. **Never invent filler for rhyme.** No unsupported props, actions, dialogue, or motives.
6. **Show real alternatives.** Options should represent meaningfully different literary strategies, not tiny word substitutions.
7. **Approval is local and explicit.** “Yes,” “okay,” or “go for it” authorizes only the next visible action. Locked wording is never silently rewritten.

## 3. Current end-to-end workflow

### Step 1 — Add the first three spreads

- Begin with one large image drop zone.
- The whole zone is clickable and supports drag-and-drop.
- Once the first image is added, reveal a second slot to its right; then reveal a third.
- Do not show three empty boxes initially.
- Do not use the browser’s sad-looking default “Choose file” control.
- Do not show “No image yet.”
- Once uploaded, the image fills its card edge-to-edge.
- The parent can replace an uploaded image.
- The visual should evoke photographing an open children’s book and seeing a digital text/translation layer over it.
- Avoid unnecessary titles and explanatory descriptions around obvious controls.

### Step 2 — Extract and confirm the English text

- Read the English text from each photo when real image understanding/OCR is available.
- Treat extraction as an editable draft, never as guaranteed truth.
- Show the extracted English text back to the parent beside or over the relevant image.
- Ask for a quick correction, especially for names, rhymes, unusual words, and text spread across illustrated layouts.
- Allow typing or pasting source text when extraction is unavailable or incorrect.
- The current prototype does not perform real OCR; its extracted text and translations are simulated examples.
- **Known blocking quality problem:** previous extraction was visibly incorrect. Real implementation must connect image input to a vision-capable model or dependable OCR and preserve the manual correction step.

### Step 3 — Choose translation priorities

The parent ranks:

1. Rhyme and read-aloud rhythm
2. Original meaning, jokes, picture details, and emotional beat
3. Simple vocabulary for the child

The latest known preference ranks rhythm first, fidelity/details second, and simple vocabulary third. The UI should still allow the parent to change the order for another book.

Explain briefly that poetic adaptation requires tradeoffs. Use a direct ranking interaction rather than a chat question.

### Step 4 — Choose creative freedom

Offer exactly one of:

- **Stay close** — Preserve each page’s meaning and change only what is necessary.
- **Sound naturally Slovenian** — Preserve the story and pictures, but freely rewrite awkward lines, jokes, and rhymes.
- **Reimagine playfully** — Keep the events and emotional arc, but create new Slovenian refrains and wordplay.

### Step 5 — Refrain Lab

This is the most important strategic step.

- Propose exactly three book-level literary directions before translating any spread.
- Each direction includes a name, proposed refrain or recurring device, rhyme/structure approach, what it keeps, what it changes, and any grammatical-gender dependency.
- The parent can choose, edit, replace, or combine directions.
- Once approved, mark the exact wording **Locked by parent**.
- Never silently normalize or rewrite a locked phrase.

Approved refrain examples:

- **Kako zelo imam te rad!**
- **Ti si moja ljuba goba!**

These solve different source problems and can both be valid. One preserves explicit emotional meaning; the other preserves mushroom identity and wordplay.

### Step 6 — Workshop Spread 1

Show:

- the source image;
- confirmed English source text;
- locked literary brief;
- exactly three genuinely different Slovenian alternatives.

For each option include:

- Slovenian text;
- a short strategy label;
- Choose;
- Edit;
- Try another.

Useful feedback controls:

- Love the rhythm
- Sounds unnatural
- Weak rhyme
- Too literal
- Too complicated
- Does not match the picture

The parent’s chosen or edited version becomes the approved Spread 1 draft.

### Step 7 — Pattern-test Spreads 2 and 3

- Apply the approved structure separately to Spreads 2 and 3.
- Offer three options per spread.
- Keep the refrain and priority ranking persistently visible in a compact brief.
- Support inline editing, feedback, and explicit approval.

### Step 8 — Review and lock the voice

- Show the three approved spreads together.
- Allow any line to be edited.
- Confirm whether the voice feels consistent.
- If not, rework the pattern.
- If yes, use these spreads as the voice reference for the rest of the book.

### Step 9 — Add the rest of the book

- Upload the remaining spreads in a batch.
- Show thumbnails, extracted English text, and page order.
- Let the parent correct extraction and reorder pages before generation.
- Continue one spread at a time using the locked brief and first three approved spreads as examples.
- Preserve options and parent approval at every step; do not auto-generate the whole book without checkpoints.

### Potential final output

After the adaptation is approved, possible private-family formats include:

- cut-out spread cards;
- lift-the-flap translation strips;
- a small companion booklet.

For printable output, ask for A4 or US Letter and exact dimensions when fit matters. Do not reproduce the original illustrations in exported material.

## 4. Slovenian literary standard

Good Bibaling verse should feel:

- natural in the mouth;
- musical without sounding manufactured;
- simple without becoming flat;
- warm, vivid, and playful;
- faithful to the illustration and emotional beat;
- pleasant for an adult to repeat many times.

### Parent authority

If the parent says “this has better rhythm,” “this is perfect,” “this does not rhyme,” or “we would not say it like that,” treat that as central editorial evidence.

If exact wording is approved, preserve it exactly until the parent asks to revise it.

### Poetic word order

Marked Slovenian word order is allowed when it improves cadence, remains clear, sounds intentional aloud, and the native-speaking parent approves it.

Therefore, do not automatically “correct”:

> Kako zelo imam te rad!

to the more neutral prose order:

> Kako zelo te imam rad!

### Avoid

- forced rhyme;
- filler actions or imagery;
- sugary diminutives used as rhyme crutches;
- prose arbitrarily split into lines;
- repeated stems presented as rhyme;
- visual similarities that do not rhyme aloud;
- unnatural syntax chosen only to reach an end word;
- counting syllables while ignoring natural lexical stress;
- overusing `rad / zaklad / grad / hlad`;
- overusing `goba / soba / podoba / roba`.

Do not automatically create words such as `vodice`, `posodice`, `zgodbice`, `lučkice`, or `mamice` merely because they sound childlike or rhyme.

Before showing a candidate, privately generate several structures, test the lines aloud, remove weak rhyme and source drift, and show only the strongest options.

## 5. UX and voice

### Desired feeling

- personal, warm, and meaningful;
- calm and premium;
- guided, but not robotic;
- visually coherent and uncluttered;
- closer to a thoughtful creative tool than a classroom worksheet.

### Visual direction

- warm-white or cream canvas;
- dark, readable type;
- generous spacing;
- soft rounded cards;
- restrained forest/mushroom accents;
- strong typography;
- clear progress;
- accessible contrast;
- responsive on mobile and desktop.

Avoid excessive gradients, emoji decoration, dense instructional text, generic assistant chatter, and redundant step titles/descriptions.

### Language direction

Prefer concise, human copy such as:

- “Let’s make a Slovenian version your family will actually love reading.”
- “From English pages to a story your family will love.”
- “We write your family’s version together.”
- “Writing three possibilities…”

The latest feedback was that prototype language sounded too robotic. Every prompt should acknowledge the parent’s creative role and describe the immediate meaningful outcome, not narrate system mechanics.

## 6. Technical/product behavior

- The product direction is a guided collaborative app/wrapper around a multimodal language model.
- Image understanding and literary generation must be real model calls; the existing HTML is only an interaction prototype with simulated content.
- Keep outputs short and structured.
- Request and validate structured JSON before rendering.
- Never expose raw JSON or chain-of-thought.
- Preserve all parent-entered content if a model call fails.
- Show a calm inline error with Retry; never reset the workflow.
- Show a visible loading state so the interface does not appear frozen.
- Store book-level state: source images, corrected English text, ranked priorities, creative-freedom choice, locked refrain/brief, feedback, approved drafts, and page order.

Suggested generation sequence:

1. Three refrain directions.
2. Three alternatives for Spread 1.
3. After approval, options for Spreads 2 and 3.
4. Review and lock the voice.
5. Remaining spreads one at a time.

## 7. Existing artifacts

Latest/reference files:

- `bibaling_conversational_ui_v7_central_continue.html` — latest known interaction prototype.
- `bibaling_gpt_instructions_v8_parent_led.txt` — parent-led model behavior and generation rules.
- `bibaling_slovenian_verse_guide_v4.txt` — Slovenian literary-quality reference.
- `claude_bibaling_artifact_build_prompt.md` — earlier React/AI artifact specification.

Earlier prototype iterations:

- `bibaling_conversational_ui_prototype.html`
- `bibaling_conversational_ui_v2.html`
- `bibaling_conversational_ui_v4.html`
- `bibaling_conversational_ui_v5.html`
- `bibaling_conversational_ui_v6_recess_style.html`

The newest UI feedback post-dates parts of the v7 prototype, particularly:

- reveal upload slots progressively;
- make the drop zone itself the control;
- remove default file-input UI and “No image yet”;
- let uploaded images bleed edge-to-edge;
- remove redundant titles/descriptions throughout;
- improve incorrect extracted text;
- make language warmer and less robotic;
- make the upload visual resemble a real open children’s book with a useful digital language overlay.

## 8. Current status

### Settled

- Collaborative workshop, not one-click translation.
- English picture book to Slovenian read-aloud adaptation for private family use.
- Parent/native speaker has final editorial authority.
- First three spreads establish voice.
- Priorities are explicitly ranked.
- Creative freedom is an explicit choice.
- Book-level refrain/structure is developed before page translation.
- Exact parent-approved language can be locked.
- Remaining pages are processed only after voice approval.

### Not yet genuinely built

- Accurate image text extraction.
- Real multimodal model connection.
- Real Slovenian generation inside the prototype.
- Persistent project/book storage.
- Full-book production workflow.
- Printable output.

### Immediate next product task

Build the next working prototype around the revised upload and extraction-confirmation experience, then connect it to a real multimodal model before judging the later translation steps. The first proof should demonstrate:

1. a parent can add an open-book photo naturally;
2. the app extracts the correct English text;
3. the parent can fix it with minimal friction;
4. the app uses both the image and corrected text when proposing Slovenian adaptations;
5. the resulting interaction feels personal rather than robotic.

