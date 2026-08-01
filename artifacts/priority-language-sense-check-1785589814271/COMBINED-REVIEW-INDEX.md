# Priority-language sense-check review

## Run outcome

- Paid calls made: 7
- Automatic retries: 0
- Actual estimated cost: **$0.66851**
- Total latency across calls: **355.189 seconds**
- German and Spain-Spanish: editor-only smoke checks using preserved drafts.
- Croatian and Serbian: completed drafting and editorial evaluation.
- Italian: drafting incomplete at `max_output_tokens`; no editor call.
- Serbian Latin: deterministic rendering of the Cyrillic linguistic result; no additional paid call.

## Human-review documents

- [German](../priority-language-sense-check-1785590642600/review/german.md)
- [Spanish — Spain](review/spanish-spain.md)
- [Italian](review/italian.md)
- [Croatian](review/croatian.md)
- [Serbian — Cyrillic](review/serbian-cyrillic.md)
- [Serbian — Latin](review/serbian-latin.md)

## Important pre-review findings

These are mechanical or visible findings, not final language-status decisions:

1. **Italian is unresolved.** No complete draft response or finalists exist.
2. **Serbian finalist 3 is malformed.** It contains a literal `\\n` sequence inside Page 2 instead of a real line break.
3. **Serbian script check is not clean.** `cyrillicContainsLatinLetters` is true because of that malformed literal sequence; the other two finalists remain available for native review.
4. **Model rhyme declarations require human checking.** The editor marks several weak-looking Spanish pairs as valid, including `peludo / mucho`, `manos / enlazados`, and `compañero / suelo`.
5. No `PASS`, `NEEDS_TARGETED_TUNING`, or `MOVE_TO_EXPERIMENTAL` status is final before human review.

## Raw and parsed data

- Primary batch: `artifacts/priority-language-sense-check-1785589814271/`
- German smoke call: `artifacts/priority-language-sense-check-1785590642600/`
- Every completed OpenAI response was saved in `raw/` before parsing.
- Usage and cost details are in each run's `usage-and-cost.json`.
