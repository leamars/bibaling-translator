import OpenAI from "openai";
import { NextResponse } from "next/server";

const QUALITY_MODEL = { model: "gpt-5.6-sol", label: "Sol · quality-first" } as const;
const DEBUG_MODEL = { model: "gpt-5.6-terra", label: "Terra · faster" } as const;

// Production returns exactly three quality-gated choices. The earlier side-by-side
// experiment remains available without doubling latency or choices for families.
export const COMPARISON_MODELS = process.env.BIBALING_COMPARE_MODELS === "true"
  ? [DEBUG_MODEL, QUALITY_MODEL]
  : [QUALITY_MODEL];

export function openAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_actual_key_here") return null;
  return new OpenAI({ apiKey, maxRetries: 0 });
}

export function generationError(
  error: unknown,
  fallback = "I couldn’t finish those literary options. Your choices and edits are still here—please try again."
) {
  console.error("Literary generation failed", error);
  if (error instanceof OpenAI.AuthenticationError) {
    return NextResponse.json({ error: "The OpenAI API key was rejected. Update it, restart the app, and try again." }, { status: 503 });
  }
  if (error instanceof OpenAI.RateLimitError) {
    return NextResponse.json({ error: "The OpenAI account has no available quota right now. Check billing and try again." }, { status: 503 });
  }
  const diagnostic = process.env.NODE_ENV === "development" && error instanceof Error
    ? error.message
    : undefined;
  return NextResponse.json(
    {
      error: fallback,
      ...(diagnostic ? { diagnostic } : {})
    },
    { status: 422 }
  );
}
