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
    let created = false;
    let contactSaved = false;
    try {
      const result = await resendLeadCaptureAdapter.capture(input, request.signal);
      created = result.created;
      contactSaved = true;
    } catch (error) {
      // Contact/segment enrichment must not prevent transactional delivery.
      // The delivery workflow sends directly to the submitted address and can
      // safely continue even if Resend Contacts is temporarily unavailable or
      // one of its optional properties was misconfigured.
      console.error("lead_contact_sync_failed", error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "unknown" });
    }
    return NextResponse.json({
      captured: true,
      created,
      contactSaved,
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
