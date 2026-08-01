import { z } from "zod";
import { FatalError, getStepMetadata } from "workflow";
import { assertActionBudget, controlledResponse } from "../api/openai-control";
import { openAIClient } from "../api/generation";
import {
  fullBookEditorialPrompt,
  fullBookGenerationPrompt
} from "../api/translation-prompts";
import { requiresRhyme, type BookForm, type SourceRhyme } from "../api/book-form-contract.ts";
import { failedFullBookGates } from "../api/translation-quality.ts";
import type { DirectionBrief, Freedom, Priority } from "../api/translation-prompts";
import {
  languageSelectionLabel,
  type TargetLanguage
} from "../languages/language-config.ts";

type TranslationPage = { page: number; sourceText: string; visualContext?: string };
type TranslatedPage = { page: number; text: string; idempotencyKey: string };
export type WorkflowDeliveryInput = {
  recipientEmail: string;
  pages: TranslationPage[];
  bookForm: BookForm;
  sourceRhyme: SourceRhyme;
  priority: Priority;
  freedom: Freedom;
  targetLanguage: TargetLanguage;
  regionalVariant?: string;
  direction?: DirectionBrief;
  // Parent-approved workshop pages: binding voice references, never rewritten.
  approvedPages: Array<{ page: number; text: string; parentNote?: string }>;
  // Teaser output: seeds that page's draft; the final editorial pass may polish it.
  previewPages?: Array<{ page: number; text: string }>;
  jobId: string;
};

// Independent page translations run concurrently in small batches; each page
// is still an idempotent workflow step.
const PAGE_TRANSLATION_CONCURRENCY = 4;

function pageIdempotencyKey(jobId: string, page: number) {
  return `book/${jobId}/page/${page}`;
}

function emailIdempotencyKey(jobId: string) {
  return `book-delivery/${jobId}`;
}

const draftSchema = z.object({
  spreads: z.array(z.object({ spread: z.number().int().positive(), text: z.string().min(1) })).length(1)
});
const finalItemSchema = z.object({
  spread: z.number().int().positive(),
  text: z.string().min(1),
  fidelityPass: z.boolean(),
  grammarPass: z.boolean(),
  readAloudPass: z.boolean(),
  directionPass: z.boolean(),
  rhymePass: z.boolean()
});

function fullBookJsonSchema(count: number, editorial: boolean) {
  const properties: Record<string, unknown> = {
    spread: { type: "integer" },
    text: { type: "string" }
  };
  const required = ["spread", "text"];
  if (editorial) {
    Object.assign(properties, {
      fidelityPass: { type: "boolean" },
      grammarPass: { type: "boolean" },
      readAloudPass: { type: "boolean" },
      directionPass: { type: "boolean" },
      rhymePass: { type: "boolean" }
    });
    required.push("fidelityPass", "grammarPass", "readAloudPass", "directionPass", "rhymePass");
  }
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      spreads: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: { type: "object", additionalProperties: false, properties, required }
      }
    },
    required: ["spreads"]
  } as const;
}

function promptBase(input: WorkflowDeliveryInput) {
  return {
    priority: input.priority,
    freedom: input.freedom,
    bookForm: input.bookForm,
    sourceRhyme: input.sourceRhyme,
    direction: input.direction,
    targetLanguage: input.targetLanguage,
    regionalVariant: input.regionalVariant,
    approvedVoice: [...input.approvedPages]
      .sort((a, b) => a.page - b.page)
      .map((page) => ({
        spread: page.page,
        text: page.text,
        parentNote: page.parentNote
      }))
  };
}

export async function translatePageStep(input: WorkflowDeliveryInput, page: TranslationPage): Promise<TranslatedPage> {
  "use step";
  const client = openAIClient();
  if (!client) throw new FatalError("Translation service is not configured.");
  assertActionBudget({ model: "gpt-5.6-sol", maxInputTokens: 8_000, maxOutputTokens: 3_500, callCount: 1 });
  const { response } = await controlledResponse({
    client,
    requestSignal: AbortSignal.timeout(120_000),
    action: `delivery.page.${page.page}`,
    model: "gpt-5.6-sol",
    maxOutputTokens: 3_500,
    timeoutMs: 115_000,
    body: {
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: fullBookGenerationPrompt({
            ...promptBase(input),
            spreads: [{ spread: page.page, source: page.sourceText, visualContext: page.visualContext || "" }]
          })
        }]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "durable_page_translation",
          strict: true,
          schema: fullBookJsonSchema(1, false)
        }
      }
    }
  });
  if (response.status !== "completed" || !response.output_text) {
    throw new Error(`Page ${page.page} generation did not complete.`);
  }
  const parsed = draftSchema.parse(JSON.parse(response.output_text));
  return {
    page: page.page,
    text: parsed.spreads[0].text.trim(),
    idempotencyKey: pageIdempotencyKey(input.jobId, page.page)
  };
}
translatePageStep.maxRetries = 2;

export async function finalEditorialStep(input: WorkflowDeliveryInput, drafts: TranslatedPage[]) {
  "use step";
  const client = openAIClient();
  if (!client) throw new FatalError("Translation service is not configured.");
  const ordered = [...drafts].sort((a, b) => a.page - b.page);
  assertActionBudget({ model: "gpt-5.6-sol", maxInputTokens: 16_000, maxOutputTokens: 6_000, callCount: 1 });
  const promptArgs = {
    ...promptBase(input),
    spreads: input.pages.map(({ page, sourceText, visualContext }) =>
      ({ spread: page, source: sourceText, visualContext: visualContext || "" })),
    draftsJson: JSON.stringify(ordered.map(({ page, text }) => ({ spread: page, text })))
  };
  const { response } = await controlledResponse({
    client,
    requestSignal: AbortSignal.timeout(150_000),
    action: "delivery.final_editorial",
    model: "gpt-5.6-sol",
    maxOutputTokens: 6_000,
    timeoutMs: 145_000,
    body: {
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [{ type: "input_text", text: fullBookEditorialPrompt(promptArgs) }] }],
      text: {
        format: {
          type: "json_schema",
          name: "durable_book_editorial",
          strict: true,
          schema: fullBookJsonSchema(input.pages.length, true)
        }
      }
    }
  });
  if (response.status !== "completed" || !response.output_text) {
    throw new Error("Final editorial review did not complete.");
  }
  const parsed = z.object({ spreads: z.array(finalItemSchema).length(input.pages.length) })
    .parse(JSON.parse(response.output_text));
  const expected = new Set(input.pages.map((page) => page.page));
  const actual = new Set(parsed.spreads.map((page) => page.spread));
  if (actual.size !== expected.size || parsed.spreads.some((page) => !expected.has(page.spread))) {
    throw new FatalError("Final editorial output did not contain every page exactly once.");
  }
  const failedGates = failedFullBookGates(parsed.spreads, requiresRhyme({
    bookForm: input.bookForm,
    sourceRhyme: input.sourceRhyme,
    priority: input.priority
  }));
  if (failedGates.length > 0) {
    // Translation-level rejection reported by the editorial pass itself; a
    // retry regenerates rather than shipping text the editor judged failing.
    throw new Error(
      `The final editorial pass reported failed quality gates: ${failedGates
        .map((item) => `page ${item.spread} (${item.failed.join(", ")})`)
        .join("; ")}.`
    );
  }
  // Parent-approved wording is exact: the editor sees it as voice reference
  // but its output for those pages is always overridden with the approved text.
  const approvedByPage = new Map(input.approvedPages.map((page) => [page.page, page.text]));
  return parsed.spreads
    .sort((a, b) => a.spread - b.spread)
    .map(({ spread, text }) => ({
      page: spread,
      text: approvedByPage.get(spread) ?? text
    }));
}
finalEditorialStep.maxRetries = 2;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character] || character);
}

export async function sendTranslationEmailStep(input: WorkflowDeliveryInput, pages: Array<{ page: number; text: string }>) {
  "use step";
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const replyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim();
  if (!apiKey || !from) throw new FatalError("Transactional email is not configured.");
  const ordered = [...pages].sort((a, b) => a.page - b.page);
  const language = languageSelectionLabel(input.targetLanguage, input.regionalVariant);
  const text = [
    `Your Bibaling ${language} translation`,
    "",
    ...ordered.flatMap((page) => [`Page ${page.page}`, page.text, ""]),
    "Please review the translation before reading it with your child.",
    "Reply to this email if you need help."
  ].join("\n");
  const html = `<h1>Your Bibaling ${escapeHtml(language)} translation</h1>${ordered.map((page) =>
    `<section><h2>Page ${page.page}</h2><p>${escapeHtml(page.text).replace(/\n/g, "<br>")}</p></section>`
  ).join("")}<p>Please review the translation before reading it with your child.</p>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": emailIdempotencyKey(input.jobId)
    },
    body: JSON.stringify({
      from,
      to: [input.recipientEmail],
      subject: `Your finished Bibaling ${language} translation`,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {})
    })
  });
  if (!response.ok) throw new Error(`Resend delivery failed with status ${response.status}.`);
  const metadata = getStepMetadata();
  return { delivered: true as const, pageCount: ordered.length, stepId: metadata.stepId };
}
sendTranslationEmailStep.maxRetries = 3;

export async function deliverBookWorkflow(input: WorkflowDeliveryInput) {
  "use workflow";
  const unique = new Map<number, TranslatedPage>();
  // Parent-approved pages are final text; teaser previews are pre-generated
  // drafts. Neither needs a generation step.
  for (const approved of input.approvedPages) {
    unique.set(approved.page, {
      page: approved.page,
      text: approved.text,
      idempotencyKey: pageIdempotencyKey(input.jobId, approved.page)
    });
  }
  for (const preview of input.previewPages ?? []) {
    if (unique.has(preview.page)) continue;
    unique.set(preview.page, {
      page: preview.page,
      text: preview.text,
      idempotencyKey: pageIdempotencyKey(input.jobId, preview.page)
    });
  }
  const remaining = [...input.pages]
    .sort((a, b) => a.page - b.page)
    .filter((page) => !unique.has(page.page));
  // Page translations are independent — run them in small concurrent batches.
  for (let index = 0; index < remaining.length; index += PAGE_TRANSLATION_CONCURRENCY) {
    const batch = remaining.slice(index, index + PAGE_TRANSLATION_CONCURRENCY);
    const translated = await Promise.all(batch.map((page) => translatePageStep(input, page)));
    for (const page of translated) unique.set(page.page, page);
  }
  const finalPages = await finalEditorialStep(input, [...unique.values()]);
  const delivery = await sendTranslationEmailStep(input, finalPages);
  return { status: "delivered" as const, pageCount: delivery.pageCount };
}
