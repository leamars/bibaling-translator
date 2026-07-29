export const MOCK_DIRECTIONS = [
  {
    name: "Mock direction one",
    refrain: "[MOCK] Rada te imam!",
    approach: "Interface-only fixture; not a Slovenian-quality example.",
    keeps: "Mock source action.",
    changes: "Nothing evaluated.",
    genderDependency: "Feminine mushroom narrator."
  },
  {
    name: "Mock direction two",
    refrain: "[MOCK] Drugi refren.",
    approach: "Interface-only fixture; not a Slovenian-quality example.",
    keeps: "Mock source action.",
    changes: "Nothing evaluated.",
    genderDependency: "None."
  },
  {
    name: "Mock direction three",
    refrain: "[MOCK] Tretji refren.",
    approach: "Interface-only fixture; not a Slovenian-quality example.",
    keeps: "Mock source action.",
    changes: "Nothing evaluated.",
    genderDependency: "None."
  }
];

export function mockOptions(spread: number) {
  return [1, 2, 3].map((option) => ({
    strategy: `Mock option ${option}`,
    text: `[MOCK — NOT QUALITY EVALUATED] Spread ${spread}, option ${option}.`
  }));
}
