import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { BookForm } from "../book-form-contract";
import type { TargetLanguage } from "../../languages/language-config.ts";

function secret() {
  const value = process.env.RESEND_API_KEY?.trim();
  if (!value) throw new Error("Lead receipt signing is not configured.");
  return value;
}

export function createLeadReceipt(bookForm: BookForm, targetLanguage: TargetLanguage = "sl", regionalVariant?: string) {
  const payload = Buffer.from(JSON.stringify({
    bookForm,
    targetLanguage,
    regionalVariant: regionalVariant || "",
    capturedAt: Date.now(),
    nonce: randomUUID()
  })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyLeadReceipt(
  receipt: string,
  bookForm: BookForm,
  targetLanguage: TargetLanguage = "sl",
  regionalVariant?: string
) {
  const [payload, signature] = receipt.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      bookForm?: string;
      targetLanguage?: string;
      regionalVariant?: string;
      capturedAt?: number;
    };
    return decoded.bookForm === bookForm &&
      (decoded.targetLanguage || "sl") === targetLanguage &&
      (decoded.regionalVariant || "") === (regionalVariant || "") &&
      typeof decoded.capturedAt === "number" &&
      Date.now() - decoded.capturedAt < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
