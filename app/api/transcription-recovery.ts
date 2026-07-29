import { z } from "zod";

export function recoverCompletedTextField(outputText: string) {
  const match = outputText.match(/"text"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (!match) return null;
  try {
    const text = z.string().min(1).parse(JSON.parse(match[1]));
    return {
      text,
      uncertainty: "We recovered the complete story text, but could not finish checking the illustration details.",
      visualContext: ""
    };
  } catch {
    return null;
  }
}
