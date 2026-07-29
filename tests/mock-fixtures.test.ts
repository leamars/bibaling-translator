import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_DIRECTIONS, mockOptions } from "../app/api/mock-fixtures.ts";
import { PROMPT_EVALUATION_FIXTURES } from "./fixtures/prompt-evaluation-fixtures.ts";

test("mock workshop supplies exactly three visibly marked interface choices", () => {
  assert.equal(MOCK_DIRECTIONS.length, 3);
  assert.equal(mockOptions(1).length, 3);
  for (const option of mockOptions(2)) assert.match(option.text, /^\[MOCK — NOT QUALITY EVALUATED\]/);
});

test("prompt evaluation fixtures cover the required failure classes without canonical answers", () => {
  assert.deepEqual(
    PROMPT_EVALUATION_FIXTURES.map((fixture) => fixture.id),
    [
      "unrhymed-prose",
      "simple-rhyming-verse",
      "nonportable-wordplay",
      "feminine-mushroom-narrator",
      "fidelity-rhyme-tension"
    ]
  );
  for (const fixture of PROMPT_EVALUATION_FIXTURES) {
    assert.ok(fixture.requirements.length > 1);
    assert.ok(fixture.unacceptablePatterns.length > 1);
    assert.equal("correctTranslation" in fixture, false);
  }
});
