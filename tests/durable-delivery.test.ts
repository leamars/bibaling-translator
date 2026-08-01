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
    { page: 1, sourceText: "First page.", visualContext: "" },
    { page: 2, sourceText: "Second page.", visualContext: "" },
    { page: 3, sourceText: "Third page.", visualContext: "" },
    { page: 4, sourceText: "Fourth page.", visualContext: "A mossy path." }
  ],
  bookForm: "prose_story",
  targetLanguage: "sl",
  sourceRhyme: "none",
  priority: "rhythm",
  freedom: "natural",
  approvedPages: [
    { page: 1, sourceText: "First page.", text: "Prva stran." },
    { page: 2, text: "Druga stran." },
    { page: 3, text: "Tretja stran.", parentNote: "Keep this exact rhythm." }
  ].map(({ page, text, parentNote }) => ({ page, text, ...(parentNote ? { parentNote } : {}) })),
  previewPages: [{ page: 4, text: "Četrta stran, napisana vnaprej." }]
};

test("browser closure cannot cancel mocked durable work and retries do not duplicate email", async () => {
  resetMockJobs();
  const jobId = createJobId(input);
  startMockJob(jobId, input.pages.length);
  // The initiating request/browser disappears here: no status polling is performed.
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(getMockJob(jobId), {
    status: "completed",
    pageCount: 4,
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
  assert.equal(new Set(input.pages.map((page) => pageIdempotencyKey(first, page.page))).size, 4);
  assert.equal(emailIdempotencyKey(first), emailIdempotencyKey(second));
});

test("the teaser seed and visual context never change the job identity", () => {
  // The same book resubmitted with or without a Page 4 preview (for example
  // when the teaser call failed) must map to the same durable job.
  const withoutPreview = createJobId({ ...input, previewPages: [] });
  const withPreview = createJobId(input);
  assert.equal(withoutPreview, withPreview);
  const differentVisualContext = createJobId({
    ...input,
    pages: input.pages.map((page) => ({ ...page, visualContext: "different" }))
  });
  assert.equal(differentVisualContext, withPreview);
  // Approved wording is identity-bearing: changing it is a different job.
  const differentApproved = createJobId({
    ...input,
    approvedPages: input.approvedPages.map((page) =>
      page.page === 2 ? { ...page, text: "Drugačna druga stran." } : page
    )
  });
  assert.notEqual(differentApproved, withPreview);
});
