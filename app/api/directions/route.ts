import { NextResponse } from "next/server";
import { z } from "zod";
import { COMPARISON_MODELS, generationError, openAIClient } from "../generation";

export const runtime = "nodejs";

const bodySchema = z.object({
  images: z.array(z.string().startsWith("data:image/")).length(3),
  texts: z.array(z.string().min(1)).length(3),
  priority: z.enum(["rhythm", "meaning", "simple"]),
  freedom: z.enum(["close", "natural", "playful"])
});

const directionSchema = z.object({
  directions: z.array(z.object({
    name: z.string().min(1),
    refrain: z.string().min(1),
    approach: z.string().min(1),
    keeps: z.string().min(1),
    changes: z.string().min(1),
    genderDependency: z.string().min(1)
  })).length(3)
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    directions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          refrain: { type: "string" },
          approach: { type: "string" },
          keeps: { type: "string" },
          changes: { type: "string" },
          genderDependency: { type: "string" }
        },
        required: ["name", "refrain", "approach", "keeps", "changes", "genderDependency"]
      }
    }
  },
  required: ["directions"]
} as const;

export async function POST(request: Request) {
  const client = openAIClient();
  if (!client) return NextResponse.json({ error: "Image generation isn’t connected. Add a valid OPENAI_API_KEY and restart." }, { status: 503 });

  try {
    const input = bodySchema.parse(await request.json());
    const content: Array<
      { type: "input_text"; text: string } |
      { type: "input_image"; image_url: string; detail: "high" }
    > = [{
      type: "input_text",
      text: `Role: a warm, exacting Slovenian children's-book editor.

Goal: propose exactly three genuinely different book-level literary directions for this photographed English picture book, before translating any spread.

Confirmed English, in spread order:
${input.texts.map((text, index) => `${index + 1}. ${text}`).join("\n")}

Parent's most important priority: ${input.priority}.
Creative freedom: ${input.freedom}.

Each direction needs a concise English name and editorial explanation, plus the exact Slovenian refrain or recurring device. Preserve visible events and emotional meaning. Do not invent props, actions, dialogue, or motives for rhyme. Make all three directions viable and meaningfully different in structure—not minor word swaps. State any grammatical-gender dependency; write "None" when there is none.`
    }];
    input.images.forEach((image) => content.push({ type: "input_image", image_url: image, detail: "high" }));

    const runs = await Promise.all(COMPARISON_MODELS.map(async ({ model, label }) => {
      const response = await client.responses.create({
        model,
        reasoning: { effort: "low" },
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "literary_directions", strict: true, schema: jsonSchema } }
      });
      return { model, label, ...directionSchema.parse(JSON.parse(response.output_text)) };
    }));
    return NextResponse.json({ runs });
  } catch (error) {
    return generationError(error);
  }
}
