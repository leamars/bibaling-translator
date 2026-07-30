export function mockDirections(language: string) {
  return [
  {
    name: "Mock direction one",
    refrain: `[MOCK ${language}] Refrain one.`,
    approach: "Interface-only fixture; not a language-quality example.",
    genderDependency: "None."
  },
  {
    name: "Mock direction two",
    refrain: `[MOCK ${language}] Refrain two.`,
    approach: "Interface-only fixture; not a language-quality example.",
    genderDependency: "None."
  },
  {
    name: "Mock direction three",
    refrain: `[MOCK ${language}] Refrain three.`,
    approach: "Interface-only fixture; not a language-quality example.",
    genderDependency: "None."
  }
  ];
}

export const MOCK_DIRECTIONS = mockDirections("Slovenian");

export function mockOptions(spread: number, language = "Slovenian") {
  return [1, 2, 3].map((option) => ({
    strategy: `Mock option ${option}`,
    text: language === "Slovenian"
      ? `[MOCK — NOT QUALITY EVALUATED] Spread ${spread}, option ${option}.`
      : `[MOCK ${language} — NOT QUALITY EVALUATED] Spread ${spread}, option ${option}.`
  }));
}
