import { NextResponse } from "next/server";
import { z } from "zod";
import { bookFormClassifierPrompt, BOOK_FORMS, mockBookFormAnalysis, SOURCE_RHYME } from "../book-form-contract.ts";
import { generationError, isMockRequest, openAIClient } from "../generation";
import { assertActionBudget, controlledResponse, deduplicate, requestKey } from "../openai-control";
import { resolveLanguageSelection, targetLanguageSchema } from "../../languages/language-config.ts";

export const runtime = "nodejs";

const inputSchema = z.object({
  texts: z.array(z.string().min(1)).length(3),
  visualContexts: z.array(z.string()).length(3),
  targetLanguage: targetLanguageSchema.default("sl"),
  regionalVariant: z.string().max(20).optional()
}).superRefine((input, context) => {
  try {
    resolveLanguageSelection(input.targetLanguage, input.regionalVariant);
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["regionalVariant"],
      message: error instanceof Error ? error.message : "Invalid language variant"
    });
  }
});

const resultSchema = z.object({
  bookForm: z.enum(BOOK_FORMS),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(240),
  sourceRhyme: z.enum(SOURCE_RHYME)
});

const resultJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    bookForm: { type: "string", enum: BOOK_FORMS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    explanation: { type: "string", maxLength: 240 },
    sourceRhyme: { type: "string", enum: SOURCE_RHYME }
  },
  required: ["bookForm", "confidence", "explanation", "sourceRhyme"]
} as const;

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (isMockRequest(request)) {
      return NextResponse.json({ ...mockBookFormAnalysis(input.texts), mock: true });
    }
    const client = openAIClient();
    if (!client) {
      return NextResponse.json(
        { error: "Book-form reading isn’t connected. You can still choose the form yourself." },
        { status: 503 }
      );
    }
    assertActionBudget({
      model: "gpt-5.6-terra",
      maxInputTokens: 2_500,
      maxOutputTokens: 500,
      callCount: 1
    });
    const result = await deduplicate(requestKey("book-form-v1", input), async () => {
      const { response } = await controlledResponse({
        client,
        requestSignal: request.signal,
        action: "book-form.classify",
        model: "gpt-5.6-terra",
        maxOutputTokens: 500,
        timeoutMs: 45_000,
        body: {
          model: "gpt-5.6-terra",
          reasoning: { effort: "low" },
          input: [{
            role: "user",
            content: [{ type: "input_text", text: bookFormClassifierPrompt(input) }]
          }],
          text: {
            format: {
              type: "json_schema",
              name: "book_form_classification",
              strict: true,
              schema: resultJsonSchema
            }
          }
        }
      });
      if (response.status !== "completed" || !response.output_text) {
        throw new Error(`Book-form classification did not complete: ${response.incomplete_details?.reason ?? response.status}`);
      }
      return resultSchema.parse(JSON.parse(response.output_text));
    });
    return NextResponse.json(result);
  } catch (error) {
    return generationError(
      error,
      "We couldn’t recommend a book form. Try again, or choose the form yourself."
    );
  }
}
