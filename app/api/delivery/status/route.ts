import { NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { isMockRequest } from "../../generation";
import { verifyJobToken } from "../contract";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token.startsWith("mock:") && isMockRequest(request)) {
    return NextResponse.json({ status: "completed" });
  }
  const verified = verifyJobToken(token);
  if (!verified) return NextResponse.json({ error: "Invalid job token." }, { status: 403 });
  try {
    const run = getRun(verified.runId);
    const status = await run.status;
    return NextResponse.json({
      status,
      ...(status === "completed" ? { result: await run.returnValue } : {})
    });
  } catch {
    return NextResponse.json({ error: "We couldn’t check the job yet." }, { status: 503 });
  }
}
