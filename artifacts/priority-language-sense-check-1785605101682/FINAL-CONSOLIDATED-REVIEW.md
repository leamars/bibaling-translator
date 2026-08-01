# Final priority-language human-review packet

No language selector status has been changed. All statuses below remain provisional until human review.

## Run totals

- Paid calls across the priority-language evaluation: 9
- Automatic retries: 0
- Total estimated cost: **$0.867875**
- Total model latency: **468.933 seconds**
- Italian additional calls: 2
- Italian additional estimated cost: **$0.199365**

## Review documents

- [German](../priority-language-sense-check-1785590642600/review/german.md) — provisional PASS; preferred Finalist 1
- [Spanish — Spain](../priority-language-sense-check-1785589814271/review/spanish-spain.md) — provisional NEEDS_TARGETED_TUNING
- [Italian](review/italian.md) — completed; status pending human review
- [Croatian](../priority-language-sense-check-1785589814271/review/croatian.md) — likely PASS pending native judgment
- [Serbian — Cyrillic](../priority-language-sense-check-1785589814271/review/serbian-cyrillic.md) — NEEDS_TARGETED_TUNING or native confirmation
- [Serbian — Latin](../priority-language-sense-check-1785589814271/review/serbian-latin.md) — same linguistic evaluation with deterministic script conversion

## Italian completion

- Editor recommendation: c05, shown as Finalist 1 in the review document.
- Draft latency: 72.960 seconds; editor latency: 40.784 seconds.
- Draft usage: 790 input, 3,709 output, including 2,367 reasoning tokens; $0.11522.
- Editor usage: 2,225 input, 2,434 output, including 1,392 reasoning tokens; $0.084145.
- Editor input preflight: 2,225 measured-estimate tokens, below the 2,300 ceiling.

## Approved malformed-output policy, not implemented

A visible literal `\\n` in model-generated reader-facing text should be a deterministic malformed-output violation. An actual parsed newline remains valid. The rule must not apply to parent-authored text or corrected source text, and malformed model output must not be silently normalized.

See the preserved [implementation proposal](../priority-language-sense-check-1785589814271/LITERAL-BACKSLASH-N-PROPOSAL.md).
