type MockStatus = "pending" | "running" | "completed" | "failed";
const jobs = new Map<string, { status: MockStatus; pageCount: number }>();
const sentEmails = new Set<string>();

export function startMockJob(jobId: string, pageCount: number) {
  if (!jobs.has(jobId)) jobs.set(jobId, { status: "pending", pageCount });
  queueMicrotask(() => {
    const job = jobs.get(jobId);
    if (!job || job.status === "completed") return;
    job.status = "running";
    setTimeout(() => {
      const active = jobs.get(jobId);
      if (!active) return;
      sentEmails.add(jobId);
      active.status = "completed";
    }, 40);
  });
  return `mock-${jobId}`;
}

export function getMockJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? { ...job, emailSendCount: sentEmails.has(jobId) ? 1 : 0 } : null;
}

export function resetMockJobs() {
  jobs.clear();
  sentEmails.clear();
}
