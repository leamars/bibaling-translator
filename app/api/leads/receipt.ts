import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { BookForm } from "../book-form-contract";

function secret() {
  const value = process.env.RESEND_API_KEY?.trim();
  if (!value) throw new Error("Lead receipt signing is not configured.");
  return value;
}

export function createLeadReceipt(bookForm: BookForm) {
  const payload = Buffer.from(JSON.stringify({
    bookForm,
    capturedAt: Date.now(),
    nonce: randomUUID()
  })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyLeadReceipt(receipt: string, bookForm: BookForm) {
  const [payload, signature] = receipt.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      bookForm?: string;
      capturedAt?: number;
    };
    return decoded.bookForm === bookForm &&
      typeof decoded.capturedAt === "number" &&
      Date.now() - decoded.capturedAt < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
