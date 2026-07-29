import { z } from "zod";
import { BOOK_FORMS } from "../book-form-contract";

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
  bookForm: z.enum(BOOK_FORMS)
});

export type LeadCapture = z.infer<typeof leadCaptureSchema>;
export type LeadCaptureResult = { contactId: string; created: boolean };

export interface LeadCaptureAdapter {
  capture(input: LeadCapture, signal?: AbortSignal): Promise<LeadCaptureResult>;
}
