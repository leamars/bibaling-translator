import { z } from "zod";
import { BOOK_FORMS } from "../book-form-contract";
import { resolveLanguageSelection, targetLanguageSchema } from "../../languages/language-config.ts";

export const leadCaptureSchema = z.object({
  email: z.string().email().max(320).transform((value) => value.trim().toLowerCase()),
  marketingConsent: z.boolean(),
  capturedAt: z.string().datetime(),
  attribution: z.object({
    source: z.string().max(120),
    medium: z.string().max(120),
    campaign: z.string().max(120),
    content: z.string().max(120),
    term: z.string().max(120),
    landingPage: z.string().url().max(500)
  }),
  languagePair: z.string().max(40),
  targetLanguage: targetLanguageSchema.default("sl"),
  regionalVariant: z.string().max(20).optional(),
  bookForm: z.enum(BOOK_FORMS)
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

export type LeadCapture = z.infer<typeof leadCaptureSchema>;
export type LeadCaptureResult = { contactId: string; created: boolean };

export interface LeadCaptureAdapter {
  capture(input: LeadCapture, signal?: AbortSignal): Promise<LeadCaptureResult>;
}
