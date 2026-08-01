# Minimal German evaluation — stopped as designed

The run stopped after the first editorial call reached its 2,500-token output
allowance. It made no retry and did not start either remaining fixture.

## Calls made

1. `mush-refrain-consistency-pair` drafting — completed
2. `mush-refrain-consistency-pair` lean editorial — incomplete:
   `max_output_tokens`

Calls 3–6 were not sent.

## Preserved evidence

- Six exact private drafts in the completed drafting raw response.
- Deterministic findings for all six drafts.
- The complete incomplete editorial Responses API object.
- Request status, response IDs, latency, token usage, reasoning usage, and cost.
- The approved fixtures and route-contract-proxy limitation in the run manifest.

## Usage

| Stage | Status | Latency | Input | Output | Reasoning | Cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Draft | completed | 38,754 ms | 940 | 1,515 | 822 | $0.05015 |
| Lean editor | incomplete | 68,611 ms | 2,416 | 2,500 | 1,738 | $0.08708 |
| Total | stopped | 107,365 ms | 3,356 | 4,015 | 2,560 | $0.13723 |

The editorial response did not contain a complete schema and therefore produced
no finalists, rankings, repairs, or decision suitable for blind human review.
No German item is presented as completed, and no claim is made about German
translation quality from this stopped run.

The generalized blind-review builder is included in the PR, but no German review
HTML was generated because there are zero completed editorial items to review.
