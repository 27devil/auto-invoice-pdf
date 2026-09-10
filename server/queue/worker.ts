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
 * Standalone worker process (spec §75: "Do not deploy a queue worker
 * incorrectly to a serverless runtime"). Run with `npm run worker` /
 * `npm run worker:start`, deployed as its own long-running process
 * (Railway/Render/Fly/AWS service — see docs/deployment.md) alongside, not
 * inside, the web dyno.
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

const worker = new Worker(QUEUE_NAME, processor, {
  connection: getRedisConnection(),
  concurrency,
});

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

logger.info("worker.started", { queue: QUEUE_NAME, concurrency });

async function shutdown() {
  logger.info("worker.shutting_down");
  await worker.close();
  await invoicePdfService.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
