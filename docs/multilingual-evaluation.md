# Multilingual language-pack evaluation

Bibaling still accepts English source books only. The target-language registry separates:

- universal read-aloud, fidelity, book-form, and parent-authority requirements;
- target-language drafting guidance;
- an independent target-language editorial brief;
- a regional or script variant only when it changes real usage.

## Initial configurations

| Language | Status | Initial variant |
| --- | --- | --- |
| Slovenian | Reviewed reference | `sl-SI` |
| Spanish | Priority evaluation | Spain (`es-ES`); Latin America (`es-419`) available |
| German | Priority evaluation | `de-DE` |
| Italian | Priority evaluation | `it-IT` |
| Croatian | Priority evaluation | `hr-HR` |
| Serbian | Priority evaluation | Cyrillic (`sr-Cyrl`); Latin (`sr-Latn`) available |

Additional languages spoken across Europe are exposed as experimental packs. Portuguese has Portugal and Brazil variants because the distinction materially affects reader-facing language.

These configurations are not claims of native-speaker validation. Each pack is deliberately concise and independently editable; it is not a translated copy of the Slovenian guide.

## Evaluation inputs

`tests/fixtures/multilingual-evaluation-fixtures.ts` contains six transcribed spreads from the
local **I Love You So Mush** and **Llama Llama Red Pajama** evaluation page sets:

1. affectionate mushroom refrain and MUSH wordplay;
2. linked-hands motion, end rhyme, and refrain consistency;
3. jelly-fungus movement and move/groove wordplay;
4. compact Llama Llama bedtime verse;
5. Mama’s direct speech and tizzy/busy/llama-drama wordplay;
6. extremely simple closing language without forced rhyme.

Each fixture records its English source, visual context, book form, source-rhyme treatment, parent priority, adaptation freedom, and review requirements. It intentionally does not define one correct translation.

These two books do not provide an ordinary-prose sample. The controlled Spanish run therefore
does not validate `prose_story`; a later evaluation needs a real prose picture-book source.

## Artifact format

Every record in `artifacts/multilingual-evaluation-*.json` contains:

- fixture and category;
- English source and visual context;
- requirements;
- target language and regional variant;
- book form;
- complete drafting prompt and six private drafting options;
- complete independent editorial prompt and three editorial results;
- selected/final output;
- mock or live mode.

The artifact still requires native-speaker review.

## Safe commands

Mock mode is the default and makes no model call:

```bash
node --experimental-strip-types scripts/multilingual-evaluation.ts
```

Live mode is deliberately double-gated and must not be used without explicit approval:

```bash
CONFIRM_MULTILINGUAL_LIVE=RUN_MULTILINGUAL_EVALUATION \
  node --env-file=.env.local --experimental-strip-types \
  scripts/multilingual-evaluation.ts --live
```

The live run performs drafting and independent editorial calls for every fixture/language combination. Use a narrower reviewed subset before enabling the complete matrix if cost or latency is a concern.

## Controlled Spanish review

The first paid review has its own stricter harness. It is locked to neutral contemporary Spanish
from Spain (`es-ES`), performs one book-level refrain drafting/editorial setup for the mushroom
spreads, then one drafting and one editorial call for each of the six spreads. It makes no automatic
retries and records prompts, candidates, assessments, warnings, timing, token usage, and estimated
cost.

It must not run until the inputs have been explicitly approved:

```bash
CONFIRM_SPANISH_LIVE=RUN_SPANISH_EVALUATION \
  node --env-file=.env.local --experimental-strip-types \
  scripts/live-spanish-evaluation.ts --live --language=es-ES
```
