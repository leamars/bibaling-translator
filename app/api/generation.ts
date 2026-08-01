import OpenAI from "openai";
import { NextResponse } from "next/server";

// The single production generation model. The earlier side-by-side model
// comparison experiment was retired; model comparisons belong in the
// live-evaluation harness under scripts/, not in the parent-facing funnel.
export const QUALITY_MODEL = { model: "gpt-5.6-sol", label: "Sol · quality-first" } as const;

export function openAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_actual_key_here") return null;
  return new OpenAI({ apiKey, maxRetries: 0 });
}

export function isMockRequest(request: Request) {
  if (process.env.BIBALING_MOCK_MODE === "true") return true;
  return request.headers.get("cookie")
    ?.split(";")
    .some((part) => part.trim() === "bibaling_mock_mode=true") ?? false;
}

export function generationError(
  error: unknown,
  fallback = "We couldn’t finish those literary options. Your choices and edits are still here—please try again."
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
