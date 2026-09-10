import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./connection.server";

export const QUEUE_NAME = "auto-invoice-pdf";

export type JobName = "generate-invoice" | "send-invoice-email" | "regenerate-invoice" | "send-credit-note";

export interface GenerateInvoiceJobData {
  shopId: string;
  shopDomain: string;
  orderGid: string;
  webhookEventId?: string;
}

export interface SendInvoiceEmailJobData {
  invoiceId: string;
}

export interface RegenerateInvoiceJobData {
  invoiceId: string;
}

export interface SendCreditNoteJobData {
  creditNoteId: string;
}

export type JobDataMap = {
  "generate-invoice": GenerateInvoiceJobData;
  "send-invoice-email": SendInvoiceEmailJobData;
  "regenerate-invoice": RegenerateInvoiceJobData;
  "send-credit-note": SendCreditNoteJobData;
};

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });
  }
  return queue;
}

/**
 * Exponential backoff (spec §21): 30s, 60s, 120s, 240s, 480s across 5
 * attempts — approximates the spec's illustrative 30s / 2min / 10min / 30min
 * schedule using BullMQ's native exponential strategy rather than a custom
 * one, so retry timing survives a worker restart without extra state.
 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 30 },
};

async function enqueue<K extends JobName>(name: K, data: JobDataMap[K], opts?: JobsOptions) {
  const q = getQueue();
  return q.add(name, data, { ...DEFAULT_JOB_OPTIONS, ...opts });
}

export const enqueueGenerateInvoice = (data: GenerateInvoiceJobData) => enqueue("generate-invoice", data);
export const enqueueSendInvoiceEmail = (data: SendInvoiceEmailJobData) => enqueue("send-invoice-email", data);
export const enqueueRegenerateInvoice = (data: RegenerateInvoiceJobData) => enqueue("regenerate-invoice", data);
export const enqueueSendCreditNote = (data: SendCreditNoteJobData) => enqueue("send-credit-note", data);

/** Used by the admin UI's "Retry" action (spec §21) and by health checks. */
export async function getJobById(jobId: string) {
  const q = getQueue();
  return q.getJob(jobId);
}

export async function getQueueCounts() {
  const q = getQueue();
  return q.getJobCounts("waiting", "active", "completed", "failed", "delayed");
}
