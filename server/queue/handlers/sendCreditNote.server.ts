import { logger } from "../../lib/logger.server";
import type { SendCreditNoteJobData } from "../jobs";

/**
 * Credit notes ship as schema-only in this MVP pass (spec §29) — nothing
 * enqueues this job yet (no refunds/create webhook is wired up). The
 * handler exists so the queue's job-name surface matches the spec and so
 * wiring up REFUNDS_CREATE later is a one-file change: implement the body
 * here (render via invoicePdfService using a credit-note template, upload,
 * email) and hook the webhook to `enqueueSendCreditNote`.
 */
export async function handleSendCreditNote(data: SendCreditNoteJobData): Promise<void> {
  logger.warn("credit_note.not_implemented", { creditNoteId: data.creditNoteId });
}
