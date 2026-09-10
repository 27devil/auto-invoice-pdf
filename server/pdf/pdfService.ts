import { createHash } from "node:crypto";
import type { Browser } from "playwright";
import { renderInvoiceHtml } from "./template";
import type { InvoicePdfData } from "./types";
import { Errors } from "../lib/errors.server";
import { logger } from "../lib/logger.server";

/**
 * PDF generation is fully independent of the Shopify API and of Prisma —
 * it only knows about the InvoicePdfData contract (spec §61). Rendering
 * uses a real browser (Playwright/Chromium) rather than a low-level PDF
 * primitives library, which is what makes the invoice table paginate
 * correctly across multiple pages for long orders (spec §11, §52) instead
 * of clipping or overlapping.
 */
export class InvoicePdfService {
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      const { chromium } = await import("playwright");
      this.browserPromise = chromium.launch({ headless: true, args: ["--no-sandbox"] }).catch((error) => {
        this.browserPromise = null;
        throw error;
      });
    }
    return this.browserPromise;
  }

  /** Renders an invoice to a PDF buffer. Callers persist the buffer via StorageService. */
  async generateInvoicePdf(data: InvoicePdfData): Promise<{ buffer: Buffer; checksum: string }> {
    const html = renderInvoiceHtml(data);
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "networkidle" });
        const buffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "12mm", bottom: "16mm", left: "0mm", right: "0mm" },
          displayHeaderFooter: true,
          headerTemplate: `<div></div>`,
          footerTemplate: `
            <div style="width:100%;font-size:8px;color:#8a97a3;padding:0 40px;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;">
              <span>${escapeForTemplate(data.invoiceNumber)}</span>
              <span class="pageNumber"></span>&nbsp;/&nbsp;<span class="totalPages"></span>
            </div>`,
        });
        const checksum = createHash("sha256").update(buffer).digest("hex");
        return { buffer, checksum };
      } finally {
        await page.close();
      }
    } catch (error) {
      logger.error("pdf.generation_failed", { invoiceNumber: data.invoiceNumber, error: String(error) });
      throw Errors.pdfGenerationFailed(error);
    }
  }

  /** Renders an in-browser preview (used by /app/invoices/:id and the design preview). */
  async renderPreview(data: InvoicePdfData): Promise<string> {
    return renderInvoiceHtml(data);
  }

  async close(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }
}

function escapeForTemplate(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Singleton — Playwright's Chromium instance is expensive to boot, so the
// worker process reuses one browser across jobs rather than launching per PDF.
export const invoicePdfService = new InvoicePdfService();
