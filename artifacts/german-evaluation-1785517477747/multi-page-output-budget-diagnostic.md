# Multi-page editorial output-budget diagnostic

This report analyzes the preserved 3,500-token editor-only retry for
`mush-refrain-consistency-pair`. It does not change a prompt, schema, validator,
or production behavior, and it does not authorize another model call.

## Exact stopping point

The response stopped with `status: incomplete` and
`incomplete_details.reason: max_output_tokens`.

- Input tokens: 2,419
- Cached input tokens: 0
- Output allowance consumed: 3,500 / 3,500 tokens
- Hidden reasoning tokens: 1,495 (42.7% of the allowance)
- Approximate visible-output tokens: 2,005 (57.3% of the allowance)
- Visible partial JSON: 7,050 characters
- Latency: 77,102 ms
- Estimated cost: $0.117095

The model completed all three finalist objects, including ranks, eligibility,
repairs, and rhyme evidence. It then emitted `"decision":{"out` and was cut
off. The following required sections therefore remained unfinished:

- the decision outcome;
- selected candidate IDs;
- decision rationale;
- winner comparisons;
- any top-level concern findings;
- the closing JSON structure.

The response is not schema-valid and no recommendation, equivalent group, or
whole-set rejection can be certified from it.

## Where the visible budget went

The three completed finalist objects occupy 7,013 serialized characters. Their
field-level footprint is:

| Content | Serialized characters | Share of finalist JSON |
| --- | ---: | ---: |
| Original two-page texts | 788 | 11.2% |
| Repaired/evaluated two-page texts | 846 | 12.1% |
| Applied edits, including full `before`/`after` pairs | 1,615 | 23.0% |
| Strengths | 473 | 6.7% |
| Weaknesses | 340 | 4.8% |
| Optional edits | 212 | 3.0% |
| Required edits | 671 | 9.6% |
| Eligibility flags | 285 | 4.1% |
| Rhyme evidence | 1,105 | 15.8% |
| IDs, ranks, booleans, keys, and JSON framing | 678 | 9.7% |

The direct text payload—`originalText`, `evaluatedText`, and the full
`before`/`after` values inside `appliedEdits`—uses 3,117 serialized characters,
or 44.4% of the finalist JSON. The applied-edit copies alone repeat 1,483
characters of before/after book text, or 21.1% of the finalist JSON.

All three finalists were repaired. For each finalist, the response therefore
carried four two-page text pairs:

1. original text;
2. evaluated text;
3. the applied edit's `before` text;
4. the applied edit's `after` text.

That is 12 page-pair payloads, or 24 individual page bodies, for three
finalists. Across those direct text values, Page 1 accounts for 1,638 raw
characters and Page 2 for 1,360. The second page alone adds 45.4% of the direct
page-text payload and about 19.4% of the complete finalist JSON. A single-page
response would still duplicate text structurally, but evaluating two pages
together nearly doubles that portion.

The partial `appliedEdits` also show the cost pressure degrading audit quality:
their full-page `before` and `after` strings were shortened or corrupted rather
than remaining exact copies of `originalText` and `evaluatedText`. They therefore
consumed substantial space without reliably preserving the required exact edit
provenance.

## Semantic duplication among findings

The assessment fields use another 3,086 characters (44.0% of finalist JSON)
across strengths, weaknesses, optional edits, required edits, eligibility, and
rhyme evidence. These are not byte-for-byte duplicates, but several judgments
are restated in multiple places:

- rhyme pairs named in `strengths` are repeated as anchors and prose notes in
  `rhymeEvidence`;
- weak or absent rhyme described in `weaknesses` is repeated in optional or
  required edits and again in rhyme findings;
- repair reasons in `requiredEdits` restate naturalness, fidelity, pronoun, or
  rhyme problems already represented by the eligibility gates;
- six all-true eligibility flags repeat the overall result after strengths,
  weaknesses, and resolved required edits have already explained it.

Rhyme evidence itself is not the sole cause: it used 1,105 characters, and each
finalist returned only two records. Hidden reasoning is also not the sole cause:
it consumed 42.7%, while the visible schema still needed more than the remaining
57.3%. The precise cause is the combination of substantial reasoning with a
multi-page schema that repeats full source/repaired text and asks several fields
to narrate overlapping editorial judgments.

## Proposed general multi-page contract

The saved candidate bundle should own each original page exactly once. The
editor receives those stable candidates as input and returns references to them.
The response should not echo unchanged original book text.

```ts
type MultiPageEditorialResult = {
  candidates: Array<{
    sourceCandidateId: string;
    rank: 1 | 2 | 3;

    // Omitted when no repair occurred. The local artifact reconstructs the
    // evaluated candidate from its stored source plus these replacements.
    repair: null | {
      repairedAsDistinctResult: boolean;
      repairedPages: Array<{
        pageId: string;
        text: string; // complete repaired page, stored once
      }>;
      appliedEdits: Array<{
        editId: string;
        pageId: string;
        lineIds: string[];
        operation: "edit" | "remove" | "reorder" | "restore" | "replace" | "rewrite";
        severity: "substantive" | "fatal";
        before: string; // exact affected line/span, never the complete page pair
        after: string;  // exact replacement; empty only for removal
      }>;
    };

    strengths: Array<{
      findingId: string;
      summary: string;
      pageIds?: string[]; // omitted for candidate-level findings
      lineIds?: string[];
    }>;
    weaknesses: Array<{
      findingId: string;
      severity: "optional" | "substantive" | "fatal";
      dimension: "fidelity" | "naturalness" | "tone" | "read_aloud" | "direction" | "rhyme";
      summary: string;
      pageIds?: string[];
      lineIds?: string[];
      resolvedByEditId?: string;
    }>;

    eligibility: {
      fidelity: boolean;
      naturalness: boolean;
      tone: boolean;
      readAloud: boolean;
      direction: boolean;
      rhyme: boolean;
      failureFindingIds: string[]; // references weaknesses; no repeated prose
    };

    sharedRefrain?: {
      text: string; // recorded once per candidate
      occurrences: Array<{ pageId: string; lineIds: string[] }>;
      consistentAcrossPages: boolean;
      findingIds: string[];
    };

    rhymeEvidence: Array<{
      pageId: string;
      lineAId: string;
      lineBId: string;
      anchorA: string;
      anchorB: string;
      classification: "full_rhyme" | "assonance" | "consonance" | "internal_rhyme" | "no_meaningful_rhyme";
      countsAsRhyme: boolean;
      forcedOrGrammatical: boolean;
      findingId?: string; // references a weakness instead of repeating its note
    }>;
  }>;

  decision: {
    outcome: "recommended" | "equivalent_group" | "no_qualifying_finalist";
    candidateIds: string[];
    rationale: string;
    comparisons: Array<{
      candidateId: string;
      betterCandidateIds: string[];
      findingIds: string[];
      summary: string;
    }>;
  };

  concernFindings: Array<{
    concernId: string;
    disposition: "recognized" | "addressed" | "unresolved" | "disagreed";
    candidateId?: string;
    pageId?: string;
    lineIds?: string[];
    findingIds?: string[];
    note: string;
  }>;
};
```

Stable `pageId` and `lineId` values must be assigned before the request and
stored with the original candidates. A validator can then confirm that every
reference exists and that exact `before` spans match the stored source. It can
reconstruct repaired pages, compare them with the returned `repairedPages`, and
retain the original-versus-repaired distinction without asking the model to
repeat full page pairs in three fields.

### Removed or referenced instead of repeated

- Remove `originalText` from every finalist response; resolve it through
  `sourceCandidateId` in the saved input artifact.
- Remove the second full-page copy from `appliedEdits.before`; use exact stable
  line/span references and only the affected text.
- Remove the second full-page copy from `appliedEdits.after`; store repaired page
  text once and retain only the exact changed replacement span in the edit.
- Replace prose eligibility failures with `failureFindingIds` referencing one
  material weakness.
- Replace rhyme-note prose that repeats a weakness with a `findingId`.
- Record candidate-level strengths and eligibility once. Return page-level
  findings only when a page materially differs.
- Record the shared refrain once, with occurrence references and one consistency
  result, rather than explaining its consistency separately per page.

This preserves candidate provenance, exact substantive edits, full ranking and
eligibility, material page-specific failures, auditable rhyme anchors, refrain
consistency, and the three-way final decision.

## Contract scope

This should be a **general multi-page extension**, not a modification to the
existing single-page lean contract. The single-page contract is already verified
for its intended scope. Multi-page evaluation introduces stable page/line
identity, cross-page refrain consistency, and materially different duplication
pressure. Both contracts can share eligibility, edit-severity, rhyme, finding,
and decision primitives without forcing single-page callers to adopt multi-page
indirection.

The optional `sharedRefrain` block should be required only for
`refrain_verse`, absent for prose, and used only when the source contract calls
for a repeated refrain. The multi-page contract itself remains language-neutral.

## Smallest verification call

One editor-only call is sufficient:

- fixture: the same saved two-page German repeating-refrain item;
- inputs: the same six saved drafts and German guidance;
- drafting calls: 0;
- editorial calls: 1;
- reasoning: low;
- output allowance: 2,500 tokens;
- automatic retries: 0;
- verify schema validity, provenance reconstruction, exact applied edits,
  ranking/eligibility, refrain consistency, rhyme references, and final decision.

Using the existing conservative 13,000-token maximum input estimate and current
reviewed model prices, the maximum estimated cost would be **$0.14**:

- input: 13,000 × $5 / 1,000,000 = $0.065;
- output: 2,500 × $30 / 1,000,000 = $0.075.

No such verification call has been made.
