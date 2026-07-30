import assert from "node:assert/strict";
import test from "node:test";
import {
  getMockJob,
  resetMockJobs,
  startMockJob
} from "../app/api/delivery/mock-store.ts";
import {
  createJobId,
  emailIdempotencyKey,
  pageIdempotencyKey,
  type DeliveryInput
} from "../app/api/delivery/contract.ts";

const input: DeliveryInput = {
  leadReceipt: "signed-receipt",
  recipientEmail: "parent@example.com",
  pages: [
    { page: 1, sourceText: "First page." },
    { page: 2, sourceText: "Second page." },
    { page: 3, sourceText: "Third page." }
  ],
  bookForm: "prose_story",
  sourceRhyme: "none",
  priority: "rhythm",
  freedom: "natural",
  approvedPage1: "Prva stran."
};

test("browser closure cannot cancel mocked durable work and retries do not duplicate email", async () => {
  resetMockJobs();
  const jobId = createJobId(input);
  startMockJob(jobId, input.pages.length);
  // The initiating request/browser disappears here: no status polling is performed.
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(getMockJob(jobId), {
    status: "completed",
    pageCount: 3,
    emailSendCount: 1
  });
  startMockJob(jobId, input.pages.length);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(getMockJob(jobId)?.emailSendCount, 1);
});

test("job, page, and email idempotency keys are stable and content-derived", () => {
  const first = createJobId(input);
  const second = createJobId({ ...input, pages: [...input.pages] });
  assert.equal(first, second);
  assert.equal(new Set(input.pages.map((page) => pageIdempotencyKey(first, page.page))).size, 3);
  assert.equal(emailIdempotencyKey(first), emailIdempotencyKey(second));
});
