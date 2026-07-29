import OpenAI from "openai";
import { NextResponse } from "next/server";

export const COMPARISON_MODELS = [
  { model: "gpt-5.6-terra", label: "Terra · faster" },
  { model: "gpt-5.6-sol", label: "Sol · quality-first" }
] as const;

export function openAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_actual_key_here") return null;
  return new OpenAI({ apiKey });
}

export function generationError(error: unknown) {
  console.error("Literary generation failed", error);
  if (error instanceof OpenAI.AuthenticationError) {
    return NextResponse.json({ error: "The OpenAI API key was rejected. Update it, restart the app, and try again." }, { status: 503 });
  }
  if (error instanceof OpenAI.RateLimitError) {
    return NextResponse.json({ error: "The OpenAI account has no available quota right now. Check billing and try again." }, { status: 503 });
  }
  return NextResponse.json(
    { error: "I couldn’t finish those literary options. Your choices and edits are still here—please try again." },
    { status: 422 }
  );
}
