import { NextResponse } from "next/server";
import { z } from "zod";
import { COMPARISON_MODELS, generationError, openAIClient } from "../generation";

export const runtime = "nodejs";

const directionSchema = z.object({
  name: z.string().min(1),
  refrain: z.string().min(1),
  approach: z.string().min(1),
  keeps: z.string().min(1),
  changes: z.string().min(1),
  genderDependency: z.string().min(1)
});

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("spread1"),
    image: z.string().startsWith("data:image/"),
    source: z.string().min(1),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    direction: directionSchema
  }),
  z.object({
    mode: z.literal("pattern"),
    images: z.array(z.string().startsWith("data:image/")).length(2),
    sources: z.array(z.string().min(1)).length(2),
    priority: z.enum(["rhythm", "meaning", "simple"]),
    freedom: z.enum(["close", "natural", "playful"]),
    direction: directionSchema,
    approvedSpread1: z.string().min(1)
  })
]);

const optionObject = {
  type: "object",
  additionalProperties: false,
  properties: {
    strategy: { type: "string" },
    text: { type: "string" }
  },
  required: ["strategy", "text"]
} as const;

const spread1JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    options: { type: "array", minItems: 3, maxItems: 3, items: optionObject }
  },
  required: ["options"]
} as const;

const patternJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    spreads: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          spread: { type: "integer", enum: [2, 3] },
          options: { type: "array", minItems: 3, maxItems: 3, items: optionObject }
        },
        required: ["spread", "options"]
      }
    }
  },
  required: ["spreads"]
} as const;

const optionSchema = z.object({ strategy: z.string().min(1), text: z.string().min(1) });
const spread1Result = z.object({ options: z.array(optionSchema).length(3) });
const patternResult = z.object({
  spreads: z.array(z.object({
    spread: z.number().int().min(2).max(3),
    options: z.array(optionSchema).length(3)
  })).length(2)
});

function directionBrief(direction: z.infer<typeof directionSchema>) {
  return `Locked direction (preserve its exact refrain wording):
Name: ${direction.name}
Exact refrain/device: ${direction.refrain}
Approach: ${direction.approach}
Keeps: ${direction.keeps}
Changes: ${direction.changes}
Gender dependency: ${direction.genderDependency}`;
}

export async function POST(request: Request) {
  const client = openAIClient();
  if (!client) return NextResponse.json({ error: "Translation generation isn’t connected. Add a valid OPENAI_API_KEY and restart." }, { status: 503 });

  try {
    const input = bodySchema.parse(await request.json());
    if (input.mode === "spread1") {
      const runs = await Promise.all(COMPARISON_MODELS.map(async ({ model, label }) => {
        const response = await client.responses.create({
          model,
          reasoning: { effort: "low" },
          input: [{
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Write exactly three genuinely different Slovenian read-aloud translations for Spread 1.

English source: ${input.source}
Most important priority: ${input.priority}
Creative freedom: ${input.freedom}
${directionBrief(input.direction)}

Show real literary alternatives, not tiny word substitutions. Keep natural spoken Slovenian, picture truth, emotional meaning, and appropriate text density. Privately reject forced rhyme, filler details, repeated-stem pseudo-rhyme, and unnatural syntax. Each option needs a short English strategy label and the complete Slovenian text. Return the actual text immediately.`
              },
              { type: "input_image", image_url: input.image, detail: "high" }
            ]
          }],
          text: { format: { type: "json_schema", name: "spread_one_options", strict: true, schema: spread1JsonSchema } }
        });
        return { model, label, ...spread1Result.parse(JSON.parse(response.output_text)) };
      }));
      return NextResponse.json({ runs });
    }

    const runs = await Promise.all(COMPARISON_MODELS.map(async ({ model, label }) => {
      const response = await client.responses.create({
        model,
        reasoning: { effort: "low" },
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Pattern-test the approved book voice on Spreads 2 and 3.

Spread 2 English: ${input.sources[0]}
Spread 3 English: ${input.sources[1]}
Approved Spread 1 Slovenian draft (voice reference): ${input.approvedSpread1}
Most important priority: ${input.priority}
Creative freedom: ${input.freedom}
${directionBrief(input.direction)}

For each spread, return exactly three genuinely different Slovenian alternatives with short English strategy labels. Match each image and source independently while maintaining the approved voice. Preserve the locked refrain exactly whenever used. Do not invent filler for rhyme. Return Spread 2 first and Spread 3 second.`
            },
            { type: "input_image", image_url: input.images[0], detail: "high" },
            { type: "input_image", image_url: input.images[1], detail: "high" }
          ]
        }],
        text: { format: { type: "json_schema", name: "pattern_test_options", strict: true, schema: patternJsonSchema } }
      });
      const parsed = patternResult.parse(JSON.parse(response.output_text));
      if (parsed.spreads[0].spread !== 2 || parsed.spreads[1].spread !== 3) throw new Error("Unexpected spread order");
      return { model, label, ...parsed };
    }));
    return NextResponse.json({ runs });
  } catch (error) {
    return generationError(error);
  }
}
