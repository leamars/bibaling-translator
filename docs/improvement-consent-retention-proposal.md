# Improvement-consent and retention proposal

Status: proposal only. This document does not change production retention or
add a consent control.

## Parent-facing control

**Help make Bibaling better**

Keep my book photos, translations, and feedback so Bibaling can improve.
Optional.

The control should:

- be unchecked by default;
- remain separate from result delivery, marketing consent, and analytics
  consent;
- never block or change the translation when declined;
- require an affirmative action before any improvement-specific retention;
- make withdrawal available through a clear account-free contact or deletion
  path.

## Expandable details

The interface should provide concise expandable details covering:

- **What is retained:** the book photos, corrected source text, generated
  translations, parent edits, and feedback covered by the consent;
- **Why:** evaluation and improvement of Bibaling's translation and
  read-aloud behavior;
- **How long:** an owner-approved, explicit retention period that must be
  chosen before implementation;
- **Protection:** access controls, encryption in transit and at rest where the
  selected storage provider supports it, and restricted operational access;
- **Withdrawal:** how a parent can withdraw consent and request deletion, plus
  what happens to data already incorporated into aggregate evaluation
  findings.

## Required decisions before implementation

The owner still needs to decide:

1. the exact retention duration;
2. the durable storage provider and region;
3. the deletion and withdrawal contact/process;
4. whether any de-identified evaluation artifact may outlive the raw photos;
5. who may access retained material;
6. whether parental confirmation requirements differ by country.

No production code should imply answers to these questions before those
decisions are made and reflected in the privacy disclosure.
