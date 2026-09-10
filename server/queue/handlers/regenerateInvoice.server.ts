import prisma from "../../../app/db.server";
import { invoicePdfService } from "../../pdf/pdfService";
import { mapInvoiceToPdfData } from "../../pdf/mapInvoiceToPdfData";
import { resolveLogoDataUrl } from "../../pdf/logo.server";
import { getStorageService, invoicePdfKey } from "../../storage/index.server";
import { recordAuditLog } from "../../lib/audit.server";
import { getOrInitShopSettings } from "../../settings/SettingsService.server";
import type { RegenerateInvoiceJobData } from "../jobs";

/**
 * Regenerates the PDF for an existing invoice WITHOUT changing its invoice
 * number (spec §40). Bumps pdfVersion so the old rendition is never
 * silently overwritten — see docs/pdf.md §Versioning.
 */
export async function handleRegenerateInvoice(data: RegenerateInvoiceJobData): Promise<void> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: data.invoiceId }, include: { items: true } });
  const shop = await getOrInitShopSettings(prisma, invoice.shopId);

  const storage = await getStorageService();
  const logoDataUrl = await resolveLogoDataUrl(storage, shop.companyProfile.logoStorageKey);

  const nextVersion = invoice.pdfVersion + 1;
  const pdfData = mapInvoiceToPdfData({
    invoice,
    company: shop.companyProfile,
    design: shop.designSettings,
    tax: shop.taxSettings,
    logoDataUrl,
    dateFormat: shop.storeSettings.dateFormat,
  });

  const { buffer, checksum } = await invoicePdfService.generateInvoicePdf(pdfData);
  const key = invoicePdfKey(shop.shopDomain, invoice.invoiceNumber, nextVersion);
  await storage.upload(key, buffer, "application/pdf");

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfStorageKey: key, pdfChecksum: checksum, pdfVersion: nextVersion, invoiceStatus: "GENERATED" },
  });

  await recordAuditLog(prisma, {
    shopId: shop.id,
    action: "invoice.regenerated",
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, version: nextVersion },
  });
}
