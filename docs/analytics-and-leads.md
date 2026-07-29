# Analytics and lead capture

The three-page preview is free to complete. Resend capture gates only the remaining-page upload and full-book generation.

## Resend

Configure `RESEND_API_KEY`, `RESEND_LEADS_SEGMENT_ID`, `RESEND_MARKETING_TOPIC_ID`, `RESEND_FROM_EMAIL`, and `RESEND_REPLY_TO_EMAIL` server-side. In Resend, create string contact properties named:

`capture_timestamp`, `marketing_consent`, `marketing_consent_timestamp`, `source`, `medium`, `campaign`, `content`, `term`, `original_landing_page`, `language_pair`, and `confirmed_book_form`.

The adapter updates contacts by normalized email and creates them only when no contact exists. Every captured contact is placed in the dedicated leads segment. The marketing topic is attached only for explicit opt-in. Translator content is excluded from the endpoint schema and Resend payload.

## GA4

Configure `NEXT_PUBLIC_GA_MEASUREMENT_ID`. GA4 remains inactive until explicit analytics consent. Events use an anonymous session UUID and never include email or book content.

Register these event-scoped custom dimensions in GA4:

- `book_form`
- `language_pair`
- `session_id`

Events: `first_translation_seen`, `three_page_preview_seen`, `email_gate_viewed`, `email_captured`, `qualified_lead`, and `full_book_started`.

Mark `qualified_lead` as a GA4 key event. It fires only after the three-page preview milestone and successful Resend capture, making it suitable for later Google Ads import.
