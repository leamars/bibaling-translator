# PR #15 manual end-to-end test

## Open the preview

Latest deployed commit: `d61686f`

Open:

<https://bibaling-translator-git-agent-multilingual-lang-640120-bibaling.vercel.app/translate>

The deployment is **Ready**, but Vercel Deployment Protection redirects the
page to Vercel SSO. Sign in with a Vercel account that has access to the
`bibaling` team, then follow the redirect back to the preview. There is no
separate Bibaling application login.

The same URL is available from draft PR #15: open the Vercel bot comment and
choose **Preview**.

## Preview configuration and possible blockers

The following encrypted variable names are present in Vercel's Preview
environment:

- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `RESEND_LEADS_SEGMENT_ID`
- `RESEND_MARKETING_TOPIC_ID`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO_EMAIL`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`

Their values were not displayed or copied. A configured name does not prove
that the corresponding account has quota, that a key has not expired, or that
the Resend sender remains verified. Those conditions can block a **live** run.
Vercel Workflow is supplied by the deployed platform and has no additional
project environment variable in this application.

The safe script below uses the visible **Mock mode** toggle. It does not depend
on OpenAI quota, Resend configuration, or delivery email. Deployment Protection
is the only expected authentication requirement.

## Safe-data and external-effects matrix

| Mode/action | OpenAI | Resend Contacts | Resend email / durable workflow | GA4 | Stored data |
| --- | --- | --- | --- | --- | --- |
| Mock mode, analytics declined | No | No | No; in-memory mock job only | No | Browser cookie plus local/session state; mock job temporarily in the running server instance |
| Mock mode, analytics allowed | No | No | No; in-memory mock job only | Yes, anonymous funnel events | Same mock/browser state plus GA4's consented anonymous events |
| Live mode before email | Yes: photo OCR, classification, Page 1 generation, and Refrain Lab where applicable | No | No | Only if explicitly allowed | Translator state in the browser; OpenAI receives uploaded image data during OCR |
| Live email submission | No additional call for contact capture | Yes; normalized email and allowlisted lead properties | Starts durable per-page OpenAI generation and sends a real transactional email | Only if explicitly allowed | Corrected text and job state enter the durable workflow; source photos do not |

For safe manual testing:

- use only the synthetic mock book loaded by Mock mode;
- choose **No thanks** on the analytics prompt;
- use an `example.com` address such as `refrain-test@example.com`;
- do not turn Mock mode off during a test.

The mock completion screen may say that the translation was sent to the entered
address. No email is sent in Mock mode.

## Reset between routes

For each route, reload `/translate`. If **Mock mode on** remains visible after
the reload but no mock pages appear, click it once to turn it off and once again
to turn it on. Turning Mock mode on with an empty book loads six synthetic pages.

Keep analytics declined. A declined choice is stored in the browser. Funnel
events may be queued in session storage, but they are not sent to GA4 unless the
choice is later changed to allowed.

## Common steps for all three routes

1. Open `/translate` and pass Vercel SSO.
   - Expected: the translator opens at **Add three photos from your book**.
2. Choose **No thanks** if the analytics preference is shown.
   - Expected: no GA4 events are sent.
3. Turn **Mock mode on**.
   - Expected: six synthetic book-photo cards appear; no file chooser or real
     photo is needed.
4. Keep Slovenian selected and choose **Continue**.
   - Expected: all six mock pages appear on the correction screen with editable
     English text already filled in.
5. Choose **Looks right**.
   - Expected: a short loading state is followed by **How is this book written?**
     with one recommended route. Recommendation is not binding.
6. Select the route named in the route-specific section below.
   - Expected: the selected card is visibly active and **Continue** is enabled.
7. Complete **What matters most?** and **How freely should we adapt it?** using
   any choices.
   - Expected: exactly one primary action advances at each screen; Back retains
     the current mock pages.
8. Complete the route-specific voice step.
9. On **Let's test the voice on one full page**, select one mock translation.
   Optionally choose **Edit**, change a word, and add a parent note.
   - Expected: Page 1 remains visible and editable. The email form appears below
     the completed options, not before them.
10. Enter the route's `example.com` address. Leave marketing and analytics
    unchecked. Choose **Email me the finished translation**.
    - Expected: submission is allowed with both consent boxes unchecked. Page 1
      selection and edits remain visible while the mock delivery starts.
11. Wait for the delivery screen to finish polling.
    - Expected: **We're finishing your book** changes to **Your translation is
      on its way**. No Pages 2–6 are exposed for editing, no second upload step
      appears, and no real email is sent.

## Route A — verse with a repeating refrain

Select **Verse with a repeating refrain** at Step 6 above.

- Expected after adaptation freedom: **Choose the best option for the refrain**.
- Select a generated refrain. Optionally edit it or add a custom refrain.
- Choose **Lock this direction**.
- Expected: Page 1 options are generated using the locked refrain, followed by
  the email gate.
- Safe email: `refrain-test@example.com`.

Record:

| Checkpoint | Expected | Actual / confusing moment | Severity | Screenshot |
| --- | --- | --- | --- | --- |
| Route selection | Refrain route selected |  |  |  |
| Refrain Lab | Three mock choices; selection/edit works |  |  |  |
| Page 1 | Three options; selected text remains editable |  |  |  |
| Email gate | Consents unchecked and non-blocking |  |  |  |
| Delivery | Mock completion; no remaining pages shown |  |  |  |

## Route B — rhyming or poetic story

Select **A rhyming or poetic story** at Step 6 above, even if another route is
recommended.

- Expected: Refrain Lab is skipped.
- The first priority should be **Poetic rhythm and read-aloud flow**.
- After adaptation freedom, Page 1 generation begins directly.
- No locked or fabricated refrain should appear in the voice brief.
- Safe email: `verse-test@example.com`.

Record:

| Checkpoint | Expected | Actual / confusing moment | Severity | Screenshot |
| --- | --- | --- | --- | --- |
| Route override | Continuous-verse card remains selected |  |  |  |
| Routing | Refrain Lab skipped |  |  |  |
| Voice brief | Poetic form, no refrain |  |  |  |
| Page 1 and gate | Selection required; consents optional |  |  |  |
| Delivery | Mock completion; no remaining pages shown |  |  |  |

## Route C — a story, not a poem

Select **A story, not a poem** at Step 6 above, even if another route is
recommended.

- Expected: Refrain Lab is skipped.
- Priorities should be **A natural read-aloud voice**, **Story and picture
  details**, and **Simple language**.
- After adaptation freedom, Page 1 generation begins directly.
- The voice brief should identify prose and should not claim rhyme or a refrain.
- Safe email: `prose-test@example.com`.

Record:

| Checkpoint | Expected | Actual / confusing moment | Severity | Screenshot |
| --- | --- | --- | --- | --- |
| Route override | Prose card remains selected |  |  |  |
| Routing | Refrain Lab skipped |  |  |  |
| Voice brief | Prose form, no rhyme/refrain contract shown |  |  |  |
| Page 1 and gate | Selection required; consents optional |  |  |  |
| Delivery | Mock completion; no remaining pages shown |  |  |  |

## General bug log

| Route | Screen/action | What happened | What was expected | Severity | Reproduction notes / screenshot |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

Suggested severity: **blocking**, **confusing**, or **visual polish**.

## Current support boundary

All three route branches can be exercised end to end in the deployed preview's
Mock mode. The preview also contains the live OpenAI, Resend, GA4, and durable
delivery integrations, but this checklist does not verify their credentials,
provider quota, translation quality, or actual email delivery. A live submission
would create a real Resend contact, incur OpenAI usage, start a durable workflow,
and send a real transactional email, so it is intentionally outside this safe
manual test.
