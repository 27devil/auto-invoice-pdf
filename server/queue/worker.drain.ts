import "@shopify/shopify-app-react-router/adapters/node";
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection.server";
import { QUEUE_NAME, type JobDataMap, type JobName } from "./jobs";
import { handleGenerateInvoice } from "./handlers/generateInvoice.server";
import { handleSendInvoiceEmail } from "./handlers/sendInvoiceEmail.server";
import { handleRegenerateInvoice } from "./handlers/regenerateInvoice.server";
import { handleSendCreditNote } from "./handlers/sendCreditNote.server";
import { logger } from "../lib/logger.server";
import { invoicePdfService } from "../pdf/pdfService";

/**
 * Drain-and-exit entry point for running the worker as a scheduled job
 * (GitHub Actions cron) instead of a long-lived process, for deployments
 * with no free always-on host for a persistent worker. Job-processing
 * logic is identical to worker.ts (same handlers, same queue) — only the
 * process lifecycle differs: this processes whatever is currently queued,
 * waits briefly for in-flight jobs to finish, then exits, instead of
 * running forever. See .github/workflows/worker.yml.
 *
 * Safe to run concurrently with a long-lived worker.ts elsewhere (e.g. in
 * local dev) — both are plain BullMQ workers pulling from the same queue,
 * and BullMQ guarantees a job is only ever handed to one worker.
 */
async function processor(job: Job<JobDataMap[JobName], unknown, JobName>) {
  logger.info("worker.job.start", { jobId: job.id, name: job.name, attemptsMade: job.attemptsMade });

  switch (job.name) {
    case "generate-invoice":
      return handleGenerateInvoice(job.data as JobDataMap["generate-invoice"]);
    case "send-invoice-email":
      return handleSendInvoiceEmail(job.data as JobDataMap["send-invoice-email"]);
    case "regenerate-invoice":
      return handleRegenerateInvoice(job.data as JobDataMap["regenerate-invoice"]);
    case "send-credit-note":
      return handleSendCreditNote(job.data as JobDataMap["send-credit-note"]);
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }
}

const concurrency = Number(process.env.WORKER_CONCURRENCY || 5);

// Hard ceiling so a stuck job (e.g. a hung PDF render) can't hold the
// GitHub Actions run open indefinitely — bail out well before the next
// scheduled run would fire anyway.
const MAX_RUNTIME_MS = Number(process.env.DRAIN_MAX_RUNTIME_MS || 8 * 60 * 1000);
// Grace period after BullMQ reports the queue "drained" before we actually
// close, in case another job lands in the same instant.
const IDLE_GRACE_MS = Number(process.env.DRAIN_IDLE_GRACE_MS || 5 * 1000);

const worker = new Worker(QUEUE_NAME, processor, {
  connection: getRedisConnection(),
  concurrency,
});

let exiting = false;
let idleTimer: NodeJS.Timeout | null = null;

async function finish(reason: string) {
  if (exiting) return;
  exiting = true;
  if (idleTimer) clearTimeout(idleTimer);
  clearTimeout(hardTimeout);
  logger.info("worker.drain.exit", { reason });
  await worker.close();
  await invoicePdfService.close();
  process.exit(0);
}

worker.on("completed", (job) => {
  logger.info("worker.job.completed", { jobId: job.id, name: job.name });
});

worker.on("failed", (job, error) => {
  logger.error("worker.job.failed", {
    jobId: job?.id,
    name: job?.name,
    attemptsMade: job?.attemptsMade,
    willRetry: (job?.attemptsMade ?? 0) < (job?.opts.attempts ?? 0),
    error: error.message,
  });
});

// BullMQ emits "drained" once it finds no more waiting jobs to pick up —
// on an empty queue this fires almost immediately after start. Debounce
// briefly, then close: this is what turns an always-on worker into a
// "run until empty, then exit" one.
worker.on("drained", () => {
  logger.info("worker.drain.queue_empty");
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => finish("drained"), IDLE_GRACE_MS);
});

const hardTimeout = setTimeout(() => finish("max_runtime_exceeded"), MAX_RUNTIME_MS);

logger.info("worker.drain.started", { queue: QUEUE_NAME, concurrency, maxRuntimeMs: MAX_RUNTIME_MS });

process.on("SIGTERM", () => finish("sigterm"));
process.on("SIGINT", () => finish("sigint"));
