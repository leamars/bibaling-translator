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

`tests/fixtures/multilingual-evaluation-fixtures.ts` contains six non-canonical fixtures:

1. warm prose;
2. dialogue and a joke;
3. non-rhyming continuous verse;
4. repeating-refrain consistency;
5. rhyme/wordplay without a direct structural equivalent;
6. simple baby language.

Each fixture records its English source, visual context, book form, source-rhyme treatment, parent priority, adaptation freedom, and review requirements. It intentionally does not define one correct translation.

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
