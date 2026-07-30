import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { isMockRequest } from "../generation";
import { verifyLeadReceipt } from "../leads/receipt";
import { createJobId, createJobToken, deliveryInputSchema } from "./contract";
import { startMockJob } from "./mock-store";
import { deliverBookWorkflow } from "../../workflows/book-delivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = deliveryInputSchema.parse(await request.json());
    const mock = isMockRequest(request);
    if (!mock && !verifyLeadReceipt(input.leadReceipt, input.bookForm, input.targetLanguage, input.regionalVariant)) {
      return NextResponse.json({ error: "Email capture is required before delivery." }, { status: 403 });
    }
    const jobId = createJobId(input);
    const { leadReceipt: _authorizedReceipt, ...workflowInput } = input;
    const runId = mock
      ? startMockJob(jobId, input.pages.length)
      : (await start(deliverBookWorkflow, [{ ...workflowInput, jobId }])).runId;
    return NextResponse.json({
      jobToken: mock ? `mock:${jobId}` : createJobToken(runId, jobId),
      status: "processing"
    }, { status: 202 });
  } catch (error) {
    console.error("delivery_start_failed", error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "unknown" });
    return NextResponse.json(
      { error: "We couldn’t start your translation. Your work is still here—please try again." },
      { status: 422 }
    );
  }
}
