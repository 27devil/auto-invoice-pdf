import prisma from "../../../app/db.server";
import { InvoiceEmailService } from "../../email/InvoiceEmailService";
import type { SendInvoiceEmailJobData } from "../jobs";

const emailService = new InvoiceEmailService(prisma);

export async function handleSendInvoiceEmail(data: SendInvoiceEmailJobData): Promise<void> {
  await emailService.sendInvoice(data.invoiceId, "AUTOMATIC");
}
