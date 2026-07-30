import { NextResponse } from "next/server";
import { isMockRequest } from "../generation";
import { leadCaptureSchema } from "./contract";
import { resendLeadCaptureAdapter } from "./resend-adapter";
import { createLeadReceipt } from "./receipt";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = leadCaptureSchema.parse(await request.json());
    const input = { ...parsed, capturedAt: new Date().toISOString() };
    if (isMockRequest(request)) {
      return NextResponse.json({ captured: true, created: true, receipt: "mock-lead-receipt", mock: true });
    }
    const result = await resendLeadCaptureAdapter.capture(input, request.signal);
    return NextResponse.json({
      captured: true,
      created: result.created,
      receipt: createLeadReceipt(input.bookForm, input.targetLanguage, input.regionalVariant)
    });
  } catch (error) {
    console.error("Lead capture failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "We couldn’t save your email right now. Your translation is still here—please try again." },
      { status: 502 }
    );
  }
}
