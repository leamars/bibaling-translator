import assert from "node:assert/strict";
import test from "node:test";
import {
  declaredRhymeViolations,
  deterministicViolations,
  evaluationPasses,
  structuralDiversityViolations,
  type CandidateEvaluation
} from "../app/api/translation-quality.ts";
import {
  directionsEvaluationPrompt,
  fullBookEditorialPrompt,
  translationGenerationPrompt
} from "../app/api/translation-prompts.ts";

function passingEvaluation(overrides: Partial<CandidateEvaluation> = {}): CandidateEvaluation {
  return {
    candidateId: "c01",
    fidelityPass: true,
    grammarPass: true,
    readAloudPass: true,
    directionPass: true,
    rhymePass: true,
    pass: true,
    reasons: [],
    ...overrides
  };
}

test("rejects an unrhymed result when rhyme and rhythm is locked", () => {
  const evaluation = passingEvaluation({
    rhymePass: false,
    pass: false,
    reasons: ["No coherent phonetic rhyme"]
  });
  assert.equal(
    evaluationPasses("Prijatelj me čuva v dežju.\nOb njem mi je toplo.", "rhythm", evaluation),
    false
  );
});

test("rejects the forced phrase čisto do gobic", () => {
  assert.deepEqual(
    deterministicViolations("Rada te imam čisto do gobic."),
    ["forced phrase: čisto do gobic"]
  );
  assert.equal(
    evaluationPasses("Rada te imam čisto do gobic.", "rhythm", passingEvaluation()),
    false
  );
});

test("rejects invented meaning about love growing like mushrooms", () => {
  const text = "Najina ljubezen raste kot gobe po dežju.";
  assert.ok(deterministicViolations(text).includes("invented love-growing-like-mushrooms meaning"));
  assert.equal(evaluationPasses(text, "meaning", passingEvaluation()), false);
});

test("rejects slash-form gender placeholders", () => {
  assert.ok(deterministicViolations("Zate sem vedno rad/a.").includes("slash-form gender placeholder"));
  assert.equal(evaluationPasses("Zate sem vedno rad/a.", "simple", passingEvaluation()), false);
});

test("rejects incomplete or unnatural Slovenian through baseline gates", () => {
  const incomplete = "Ker pod listom";
  assert.ok(deterministicViolations(incomplete).includes("incomplete or fragmentary Slovenian"));
  assert.equal(evaluationPasses(incomplete, "meaning", passingEvaluation()), false);

  const unnaturalEvaluation = passingEvaluation({
    grammarPass: false,
    readAloudPass: false,
    pass: false,
    reasons: ["Incomplete and unnatural Slovenian"]
  });
  assert.equal(
    evaluationPasses("Jaz ljubezen te veliko imam.", "meaning", unnaturalEvaluation),
    false
  );
});

test("accepts only candidates that clear every applicable gate", () => {
  assert.equal(
    evaluationPasses(
      "Ko noč objame tihi gozd,\nmi tvoja luč pokaže pot.",
      "meaning",
      passingEvaluation()
    ),
    true
  );
});

test("rejects meta-commentary, instructions, and unresolved placeholders in book text", () => {
  assert.ok(deterministicViolations("Opomba: izberite boljši refren.").length > 0);
  assert.ok(deterministicViolations("Prijatelj je drag. [VSTAVI REFREN]").length > 0);
});

test("rejects obvious failures in declared rhyme positions", () => {
  assert.deepEqual(
    declaredRhymeViolations("Sveti v noč.\nPrinaša sij.", [{ firstLine: 1, secondLine: 2 }]),
    ["rhyme pair 1/2 has no plausible shared ending"]
  );
  assert.deepEqual(
    declaredRhymeViolations("Povem na glas.\nZa vse nas.", [{ firstLine: 1, secondLine: 2 }]),
    []
  );
});

test("requires three distinct structures among selected finalists", () => {
  assert.ok(structuralDiversityViolations(
    ["aabb", "aabb", "call_response", "couplets"],
    ["c01", "c02", "c03"]
  ).length > 0);
});

test("direction evaluation follows corrected collective address instead of foregrounded character count", () => {
  const prompt = directionsEvaluationPrompt({
    texts: [
      "One friend is special. I love you all.",
      "These friends glow.",
      "My giant friend keeps me warm."
    ],
    priority: "rhythm",
    freedom: "natural",
    directionsJson: "[]"
  });
  assert.match(prompt, /plural Slovenian such as "vas" can faithfully serve/);
  assert.match(prompt, /do not reject a direction merely for a hypothetical risk/);
});

test("parent edit commentary becomes binding context without entering book text", () => {
  const prompt = translationGenerationPrompt({
    spreadNumber: 2,
    source: "The friends glow at night.",
    priority: "rhythm",
    freedom: "natural",
    direction: {
      name: "Test",
      refrain: "Rada vas imam!",
      approach: "Rhyming couplets",
      keeps: "Meaning",
      changes: "Wordplay",
      genderDependency: "Feminine narrator"
    },
    approvedSpread1: "Approved parent-edited text.",
    approvedSpread1Note: "The original rhyme sounded forced."
  });
  assert.match(prompt, /The original rhyme sounded forced/);
  assert.match(prompt, /binding editorial evidence/);
  assert.match(prompt, /Do not quote the note in book text/);
});

test("translation prompts reject malformed Slovenian and spelling-only rhyme generally", () => {
  const prompt = translationGenerationPrompt({
    spreadNumber: 4,
    source: "The friends play together.",
    priority: "rhythm",
    freedom: "natural",
    direction: {
      name: "Test",
      refrain: "Rada vas imam!",
      approach: "Rhyming couplets",
      keeps: "Meaning",
      changes: "Wordplay",
      genderDependency: "Feminine narrator"
    }
  });
  assert.match(prompt, /invented, malformed, or misspelled Slovenian words/);
  assert.match(prompt, /pronouns, possessives, agreement, and inflected forms/);
  assert.match(prompt, /stressed vowel and following sound sequence/);
});

test("full-book editing treats parent rhyme feedback as a correction", () => {
  const prompt = fullBookEditorialPrompt({
    spreads: [{ spread: 4, source: "The friends splash all day." }],
    priority: "rhythm",
    freedom: "natural",
    direction: {
      name: "Test",
      refrain: "Rada vas imam!",
      approach: "Rhyming couplets",
      keeps: "Meaning",
      changes: "Wordplay",
      genderDependency: "Feminine narrator"
    },
    approvedVoice: [
      { spread: 1, text: "First approved spread." },
      { spread: 2, text: "Second approved spread.", parentNote: "These line endings do not rhyme aloud." },
      { spread: 3, text: "Third approved spread." }
    ],
    draftsJson: JSON.stringify([{ spread: 4, text: "Draft." }])
  });
  assert.match(prompt, /These line endings do not rhyme aloud/);
  assert.match(prompt, /flaw to eliminate from later spreads/);
  assert.match(prompt, /Repair every submitted spread/);
});
