import prisma from "../../../app/db.server";
import { unauthenticated } from "../../../app/shopify.server";
import { getOrderForInvoice } from "../../shopify/orderService";
import { createInvoiceFromOrder } from "../../invoices/invoiceService";
import { getOrInitShopSettings } from "../../settings/SettingsService.server";
import { invoicePdfService } from "../../pdf/pdfService";
import { mapInvoiceToPdfData } from "../../pdf/mapInvoiceToPdfData";
import { resolveLogoDataUrl } from "../../pdf/logo.server";
import { getStorageService, invoicePdfKey } from "../../storage/index.server";
import { recordAuditLog } from "../../lib/audit.server";
import { logger } from "../../lib/logger.server";
import { enqueueSendInvoiceEmail } from "../jobs";
import type { GenerateInvoiceJobData } from "../jobs";

/**
 * Core workflow handler: order → invoice row → PDF → storage → (maybe)
 * queue an email job. Runs in the worker process, never inline in the
 * webhook request (spec §9, §58).
 */
export async function handleGenerateInvoice(data: GenerateInvoiceJobData): Promise<{ invoiceId: string }> {
  const shop = await getOrInitShopSettings(prisma, data.shopId);

  if (!shop.storeSettings.invoicingEnabled) {
    logger.info("invoice.generate.skip_disabled", { shopId: shop.id });
    return { invoiceId: "" };
  }

  const { admin } = await unauthenticated.admin(shop.shopDomain);

  const order = await getOrderForInvoice(admin, data.orderGid);

  let invoice = await createInvoiceFromOrder(prisma, {
    shopId: shop.id,
    shopTimezone: shop.timezone,
    order,
    numberingSettings: shop.storeSettings,
    taxSettings: shop.taxSettings,
  });

  // Idempotent re-run: another worker attempt already finished this invoice.
  if (invoice.invoiceStatus === "GENERATED" && invoice.pdfStorageKey) {
    logger.info("invoice.generate.already_complete", { invoiceId: invoice.id });
    return { invoiceId: invoice.id };
  }

  try {
    const storage = await getStorageService();
    const logoDataUrl = await resolveLogoDataUrl(storage, shop.companyProfile.logoStorageKey);

    const invoiceWithItems = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: true } });

    const pdfData = mapInvoiceToPdfData({
      invoice: invoiceWithItems,
      company: shop.companyProfile,
      design: shop.designSettings,
      tax: shop.taxSettings,
      logoDataUrl,
      dateFormat: shop.storeSettings.dateFormat,
    });

    const { buffer, checksum } = await invoicePdfService.generateInvoicePdf(pdfData);
    const key = invoicePdfKey(shop.shopDomain, invoice.invoiceNumber, invoice.pdfVersion);
    await storage.upload(key, buffer, "application/pdf");

    invoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { invoiceStatus: "GENERATED", pdfStorageKey: key, pdfChecksum: checksum },
    });

    await recordAuditLog(prisma, {
      shopId: shop.id,
      action: "invoice.pdf_generated",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, version: invoice.pdfVersion },
    });
  } catch (error) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { invoiceStatus: "FAILED" } });
    logger.error("invoice.generate.pdf_failed", { invoiceId: invoice.id, error: String(error) });
    throw error;
  }

  const deliveryMode = shop.emailSettings.deliveryMode;
  const shouldEmail = shop.emailSettings.autoEmailEnabled && deliveryMode !== "DISABLED";

  if (shouldEmail) {
    const job = await enqueueSendInvoiceEmail({ invoiceId: invoice.id });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { currentJobId: job.id } });
  } else {
    logger.info("invoice.generate.email_skipped", { invoiceId: invoice.id, autoEmailEnabled: shop.emailSettings.autoEmailEnabled, deliveryMode });
  }

  return { invoiceId: invoice.id };
}
