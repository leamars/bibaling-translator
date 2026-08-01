import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { BOOK_FORMS, SOURCE_RHYME } from "../book-form-contract.ts";
import { resolveLanguageSelection, targetLanguageSchema } from "../../languages/language-config.ts";

const directionSchema = z.object({
  name: z.string().min(1).max(200),
  refrain: z.string().min(1).max(500),
  approach: z.string().min(1).max(1_000),
  genderDependency: z.string().min(1).max(1_000)
});

export const deliveryInputSchema = z.object({
  leadReceipt: z.string().min(1),
  recipientEmail: z.string().email().transform((value) => value.trim().toLowerCase()),
  pages: z.array(z.object({
    page: z.number().int().positive(),
    sourceText: z.string().min(1).max(12_000)
  })).min(3).max(40),
  bookForm: z.enum(BOOK_FORMS),
  sourceRhyme: z.enum(SOURCE_RHYME),
  priority: z.enum(["rhythm", "meaning", "simple"]),
  freedom: z.enum(["close", "natural", "playful"]),
  targetLanguage: targetLanguageSchema.default("sl"),
  regionalVariant: z.string().max(20).optional(),
  direction: directionSchema.optional(),
  approvedPage1: z.string().min(1).max(12_000),
  approvedPage1Note: z.string().max(1_200).optional()
}).superRefine((input, context) => {
  if (input.bookForm === "refrain_verse" && !input.direction) {
    context.addIssue({ code: "custom", path: ["direction"], message: "A refrain is required for this book form." });
  }
  if (input.bookForm !== "refrain_verse" && input.direction) {
    context.addIssue({ code: "custom", path: ["direction"], message: "Non-refrain books must not contain a refrain direction." });
  }
  try {
    resolveLanguageSelection(input.targetLanguage, input.regionalVariant);
  } catch (error) {
    context.addIssue({ code: "custom", path: ["regionalVariant"], message: error instanceof Error ? error.message : "Invalid language variant" });
  }
  const unique = new Set(input.pages.map((page) => page.page));
  if (unique.size !== input.pages.length || !unique.has(1)) {
    context.addIssue({ code: "custom", path: ["pages"], message: "Pages must be unique and include Page 1." });
  }
});

export type DeliveryInput = z.infer<typeof deliveryInputSchema>;

function signingSecret() {
  const value = process.env.RESEND_API_KEY?.trim();
  if (!value) throw new Error("Delivery signing is not configured.");
  return value;
}

export function createJobId(input: DeliveryInput) {
  const canonical = {
    recipientEmail: input.recipientEmail,
    pages: [...input.pages].sort((a, b) => a.page - b.page),
    bookForm: input.bookForm,
    sourceRhyme: input.sourceRhyme,
    priority: input.priority,
    freedom: input.freedom,
    targetLanguage: input.targetLanguage,
    regionalVariant: input.regionalVariant || "",
    direction: input.direction,
    approvedPage1: input.approvedPage1,
    approvedPage1Note: input.approvedPage1Note || ""
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function pageIdempotencyKey(jobId: string, page: number) {
  return `book/${jobId}/page/${page}`;
}

export function emailIdempotencyKey(jobId: string) {
  return `book-delivery/${jobId}`;
}

export function createJobToken(runId: string, jobId: string) {
  const payload = Buffer.from(JSON.stringify({ runId, jobId })).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyJobToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      runId?: string;
      jobId?: string;
    };
    return decoded.runId && decoded.jobId ? { runId: decoded.runId, jobId: decoded.jobId } : null;
  } catch {
    return null;
  }
}
