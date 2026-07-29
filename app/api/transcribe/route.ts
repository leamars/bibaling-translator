import { NextResponse } from "next/server";
import { z } from "zod";
import { generationError, isMockRequest, openAIClient } from "../generation";
import {
  assertActionBudget,
  controlledResponse,
  deduplicate,
  requestKey
} from "../openai-control";
import { recoverCompletedTextField } from "../transcription-recovery";

export const runtime = "nodejs";

const bodySchema = z.object({
  image: z.string().startsWith("data:image/")
});

const transcriptionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    uncertainty: { type: ["string", "null"] },
    visualContext: { type: "string" }
  },
  required: ["text", "uncertainty", "visualContext"]
} as const;

const transcriptionResultSchema = z.object({
  text: z.string(),
  uncertainty: z.string().nullable(),
  visualContext: z.string()
});

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    if (isMockRequest(request)) {
      return NextResponse.json({
        text: "[MOCK OCR] Replace this with the corrected English source text.",
        uncertainty: "Mock mode does not inspect or evaluate the uploaded image.",
        visualContext: "Mock picture-book scene; no real image was inspected.",
        mock: true
      });
    }
    const client = openAIClient();
    if (!client) {
      return NextResponse.json(
        { error: "Image reading isn’t connected yet. Add a valid OPENAI_API_KEY to .env.local, restart the app, then try again." },
        { status: 503 }
      );
    }
    assertActionBudget({ model: "gpt-4.1-mini", maxInputTokens: 4_000, maxOutputTokens: 800, callCount: 2 });
    const result = await deduplicate(requestKey("transcribe", input), async () => {
      let firstFailure: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const { response } = await controlledResponse({
            client,
            requestSignal: request.signal,
            action: attempt === 0 ? "transcribe" : "transcribe.fallback",
            model: "gpt-4.1-mini",
            maxOutputTokens: 800,
            timeoutMs: 60_000,
            body: {
              model: "gpt-4.1-mini",
              input: [{
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: attempt === 0
                      ? [
                          "Read the printed English story text on this photographed children's-book spread.",
                          "Return the story text only, in natural reading order.",
                          "Use sentence context to correct obvious visual character errors into real English words.",
                          "Preserve intentional capitalization, punctuation, rhyme, and wordplay.",
                          "Also briefly summarize only clearly visible illustration details in visualContext.",
                          "Ignore page edges, logos, and decorative marks.",
                          "Never invent words hidden from view. Mention genuine ambiguity briefly in uncertainty."
                        ].join(" ")
                      : [
                          "Transcribe only the clearly visible printed English story text in this children's-book photo.",
                          "Read left page before right page. Ignore illustrations, decorative marks, page edges, and logos.",
                          "Do not describe people or infer sensitive details.",
                          "Put an empty string in visualContext.",
                          "If a word is genuinely unreadable, preserve the readable text and briefly identify the uncertainty."
                        ].join(" ")
                  },
                  { type: "input_image", image_url: input.image, detail: "high" }
                ]
              }],
              text: {
                format: {
                  type: "json_schema",
                  name: "book_transcription",
                  strict: true,
                  schema: transcriptionSchema
                }
              }
            }
          });
          if (response.status !== "completed") {
            if (response.incomplete_details?.reason === "content_filter" && response.output_text) {
              const recovered = recoverCompletedTextField(response.output_text);
              if (recovered) return recovered;
            }
            throw new Error(`Transcription did not complete: ${response.incomplete_details?.reason ?? response.status}`);
          }
          if (!response.output_text) throw new Error("Transcription completed without output.");
          return transcriptionResultSchema.parse(JSON.parse(response.output_text));
        } catch (error) {
          if (request.signal.aborted) throw error;
          firstFailure ??= error;
        }
      }
      throw firstFailure ?? new Error("Transcription failed.");
    });
    return NextResponse.json(result);
  } catch (error) {
    return generationError(
      error,
      "We couldn’t read this page reliably. Your photo is still here—please type the text or try again."
    );
  }
}
