import { NextResponse } from "next/server";
import { z } from "zod";
import { generationError, openAIClient } from "../generation";
import {
  assertActionBudget,
  controlledResponse,
  deduplicate,
  requestKey
} from "../openai-control";

export const runtime = "nodejs";

const bodySchema = z.object({
  image: z.string().startsWith("data:image/")
});

const transcriptionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    uncertainty: { type: ["string", "null"] }
  },
  required: ["text", "uncertainty"]
} as const;

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    if (process.env.BIBALING_MOCK_MODE === "true") {
      return NextResponse.json({
        text: "[MOCK OCR] Replace this with the corrected English source text.",
        uncertainty: "Mock mode does not inspect or evaluate the uploaded image.",
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
    assertActionBudget({ model: "gpt-4.1-mini", maxInputTokens: 4_000, maxOutputTokens: 800, callCount: 1 });
    const result = await deduplicate(requestKey("transcribe", input), async () => {
      const { response } = await controlledResponse({
        client,
        requestSignal: request.signal,
        action: "transcribe",
        model: "gpt-4.1-mini",
        maxOutputTokens: 800,
        body: {
          model: "gpt-4.1-mini",
          input: [{
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Read the printed English story text on this photographed children's-book spread.",
                  "Return the story text only, in natural reading order.",
                  "Use sentence context to correct obvious visual character errors into real English words.",
                  "Preserve intentional capitalization, punctuation, rhyme, and wordplay.",
                  "Ignore illustrations, page edges, logos, and decorative marks.",
                  "Never invent words hidden from view. Mention genuine ambiguity briefly in uncertainty."
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
      return JSON.parse(response.output_text) as {
        text: string;
        uncertainty: string | null;
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return generationError(
      error,
      "I couldn’t read this spread reliably. Your photo is still here—please type the text or try again."
    );
  }
}
