# Proposal: literal `\\n` in reader-facing model text

## Observed failure

Serbian Finalist 3 contains these two visible characters between lines:

```text
Печурке имају руку без броја,\nдрже се и врте — дружина моја.
```

After valid JSON parsing, a genuine escaped newline would already be a newline character. A remaining backslash followed by `n` therefore indicates double escaping or malformed reader-facing model output.

## Recommended behavior

Treat literal `\\n` as a deterministic malformed-text violation in model-generated reader-facing book text.

Do **not** silently normalize it to a real newline in production because normalization would:

- hide a malformed structured response;
- silently change exact model or parent-approved wording;
- make transport/schema failures look like valid editorial output;
- risk accepting other escaped control sequences without review.

The editor or regeneration stage may explicitly repair the candidate before it becomes parent-facing. Evaluation/import tooling may offer an explicit repair for inspection, but must retain the original text and record the applied change.

## Scope

Apply the violation only to model-generated reader-facing fields. Do not apply it to:

- corrected English source text;
- parent-authored edits;
- technical/code content outside book text.

## Focused regression test

```ts
test("literal escaped newline is malformed but a real line break is valid", () => {
  const malformed = "Печурке имају руку без броја,\\\\nдрже се и врте.";
  const valid = "Печурке имају руку без броја,\nдрже се и врте.";

  assert.match(
    deterministicViolations(malformed, { targetLanguage: "sr" }).join(" "),
    /literal escaped newline/i
  );
  assert.doesNotMatch(
    deterministicViolations(valid, { targetLanguage: "sr" }).join(" "),
    /literal escaped newline/i
  );
});
```

## Proposed implementation location

Add the precise check to the shared reader-facing deterministic validation layer, then exercise it through the page/editorial route tests. This should be a small production change on a separate branch after approval—not part of the evaluation branch.
