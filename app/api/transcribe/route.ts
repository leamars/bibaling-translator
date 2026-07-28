import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";

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
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Image reading isn’t connected yet. You can type the text instead." },
      { status: 503 }
    );
  }

  try {
    const { image } = bodySchema.parse(await request.json());
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
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
          { type: "input_image", image_url: image, detail: "high" }
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
    });

    const result = JSON.parse(response.output_text) as {
      text: string;
      uncertainty: string | null;
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Transcription failed", error);
    return NextResponse.json(
      { error: "I couldn’t read this spread reliably. Your photo is still here—please type or paste the text." },
      { status: 422 }
    );
  }
}
