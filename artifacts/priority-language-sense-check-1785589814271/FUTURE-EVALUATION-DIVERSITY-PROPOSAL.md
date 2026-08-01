# Future evaluation-only candidate-diversity proposal

## Finding

The paid calls were language-separated, but the shared mushroom fixture and shared creative instructions caused several candidate sets to converge on the same central mechanism: a coined equivalent of “I love you mushroom-y.”

This is an evaluation-design limitation. It does not by itself show poor translation quality, but it prevents the candidate sets from demonstrating useful creative breadth.

## Drafting contract for future six-candidate evaluations

Future evaluation-only drafting runs should require:

1. At least four materially distinct wordplay or refrain mechanisms among six candidates.
2. No more than two candidates built around the same coined mushroom adjective or adverb construction.
3. A short strategy label that names the actual linguistic mechanism, not a generic tone label.

Examples of mechanism-level strategy labels include:

- concrete mushroom-part image;
- target-language idiom or sound substitution;
- internal rhyme without coined morphology;
- compact call-and-response;
- affectionate declaration with no explicit mushroom coinage;
- source-grounded semantic pun.

“Warm rhyme,” “playful version,” and “lyrical option” are not sufficient mechanism labels.

Material distinction must be visible in the reader-facing language. Synonym swaps, reordered clauses, or three variants of one coined adjective/adverb do not count as separate mechanisms.

## Editorial evaluation

The evaluation-only editor should separately report:

```ts
{
  translationQuality: "pass" | "needs_tuning" | "fail";
  candidateSetDiversity: "pass" | "warning" | "fail";
}
```

The editor should flag a set when all three finalists are surface rewrites of one central joke, even when the individual translations are otherwise acceptable.

Candidate-set diversity must not lower the quality bar: a weak but different mechanism should not be promoted merely to create variety. Instead, the set should receive a diversity warning or failure.

## Interpretation

- `translationQuality` answers whether individual finalists are credible, natural translations.
- `candidateSetDiversity` answers whether the choices give a parent meaningfully different creative directions.
- A language may pass translation quality while receiving a candidate-diversity warning, as Croatian currently does.

## Additional fixture requirement

Before treating a priority-language evaluation as general evidence, test that language on at least one additional non-mushroom wordplay fixture.

The additional fixture should exercise a different linguistic problem—such as sound play, an idiom, a character-name pun, or rhythmic dialogue—so success is not inferred from one recurring mushroom-joke pattern.

## Scope

This proposal applies only to future evaluation harnesses. It does not alter production prompts, shared contracts, language packs, selector status, or the completed paid artifacts.
