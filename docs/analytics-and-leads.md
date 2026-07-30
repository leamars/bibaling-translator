# Analytics, lead capture, and durable delivery

Parents upload and correct the complete book, confirm its form and voice settings, and receive Page 1 translation options before the email gate appears. A selected, non-empty Page 1 translation and successful Resend capture start a durable Vercel Workflow. The browser does not expose the remaining translation; the final page-ordered book is sent transactionally through Resend.

## Resend

Configure `RESEND_API_KEY`, `RESEND_LEADS_SEGMENT_ID`, `RESEND_MARKETING_TOPIC_ID`, `RESEND_FROM_EMAIL`, and `RESEND_REPLY_TO_EMAIL` server-side. In Resend, create string contact properties named:

`capture_timestamp`, `marketing_consent`, `marketing_consent_timestamp`, `source`, `medium`, `campaign`, `content`, `term`, `original_landing_page`, `language_pair`, and `confirmed_book_form`.

The adapter updates contacts by normalized email and creates them only when no contact exists. Every captured contact is placed in the leads segment. The marketing topic is attached only for explicit opt-in. Transactional delivery happens regardless of marketing consent. Its stable `book-delivery/{jobId}` idempotency key prevents retrying the same job from sending duplicate emails.

## Durable data and retention

The Workflow input contains corrected/transcribed source text, confirmed book form, source-rhyme signal, translation constraints, approved Page 1 voice and note, normalized recipient email, a deterministic job ID, and job state. It never contains source photos, data URLs, filenames, analytics identifiers, or marketing attribution.

Each page uses a stable `book/{jobId}/page/{number}` key. Page steps retry at most twice, final editorial review retries at most twice, and transactional delivery retries at most three times.

Bibaling creates no secondary database copy. Workflow inputs, step arguments, and results are encrypted by Vercel Workflow. The stable Workflow API currently exposes status and cancellation but no per-run delete or configurable expiry method. Consequently this release cannot promise a fixed automatic-deletion period; Vercel’s platform retention controls apply. This remains a production-policy decision.

## GA4

The approved GA4 property is `G-EK8PPEVG54` and may be overridden with `NEXT_PUBLIC_GA_MEASUREMENT_ID`. GA4 remains inactive until explicit analytics consent: Bibaling dynamically loads `gtag.js` only after consent rather than installing Google’s unconditional page snippet. Events never include email, book content, images, filenames, feedback, prompts, translation output, Resend identifiers, signed receipts, job tokens, or a custom session identifier.

Register these event-scoped custom dimensions:

- `book_form`
- `language_pair`

Event order:

1. `translator_opened`
2. `all_photos_uploaded`
3. `first_page_generation_started`
4. `first_page_translation_displayed`
5. `email_gate_displayed`
6. `generate_lead`
7. `remaining_translation_started`
8. `delivery_succeeded` or `delivery_failed`

`generate_lead` is suitable for designation as the lead key event after Resend confirms capture.
