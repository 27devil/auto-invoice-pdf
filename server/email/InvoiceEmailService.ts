import type { PrismaClient, EmailDelivery, EmailDeliveryTrigger } from "@prisma/client";
import { getEmailProvider } from "./providerFactory.server";
import { buildEmailBody } from "./template";
import { getStorageService, invoicePdfFilename } from "../storage/index.server";
import { formatMoney, toDecimal } from "../lib/money.server";
import { Errors } from "../lib/errors.server";
import { logger } from "../lib/logger.server";
import { recordAuditLog } from "../lib/audit.server";

const ACTIVE_STATUSES = ["QUEUED", "SENDING", "SENT", "DELIVERED"] as const;

export class InvoiceEmailService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Sends (or resends) an invoice email.
   *  - AUTOMATIC sends are deduplicated: if one has already reached SENT/
   *    DELIVERED (or is in flight), this is a no-op that returns the
   *    existing delivery (spec §56).
   *  - MANUAL_RESEND always creates a new EmailDelivery record, explicitly
   *    overriding the dedupe guard (spec §56).
   *  - A missing customer email never throws — it marks the invoice
   *    NOT_SENT / CUSTOMER_EMAIL_MISSING so the merchant can send manually
   *    (spec §39).
   */
  async sendInvoice(invoiceId: string, trigger: EmailDeliveryTrigger = "AUTOMATIC"): Promise<EmailDelivery | null> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { items: true, shop: { include: { companyProfile: true, emailSettings: true } } },
    });

    const { shop } = invoice;
    const emailSettings = shop.emailSettings;
    if (!emailSettings) {
      throw Errors.invalidConfiguration("Email settings have not been initialized for this shop.");
    }

    if (emailSettings.deliveryMode === "DISABLED") {
      logger.info("email.skip.delivery_disabled", { invoiceId });
      return null;
    }

    if (!invoice.customerEmail) {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { emailStatus: "NOT_SENT", emailStatusReason: "CUSTOMER_EMAIL_MISSING" },
      });
      logger.warn("email.skip.missing_customer_email", { invoiceId });
      return null;
    }

    if (!invoice.pdfStorageKey) {
      throw Errors.emailFailed("Invoice PDF has not been generated yet");
    }

    if (trigger === "AUTOMATIC") {
      const existing = await this.prisma.emailDelivery.findFirst({
        where: { invoiceId, trigger: "AUTOMATIC", status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        logger.info("email.skip.duplicate_protection", { invoiceId, existingDeliveryId: existing.id });
        return existing;
      }
    }

    const testMode = emailSettings.testMode;
    const recipient = testMode ? emailSettings.testEmailAddress : invoice.customerEmail;
    if (testMode && !recipient) {
      throw Errors.invalidConfiguration(
        "Test mode is enabled but no test email address is configured. Set one in Settings → Email before sending.",
      );
    }

    const delivery = await this.prisma.emailDelivery.create({
      data: {
        shopId: shop.id,
        invoiceId: invoice.id,
        recipient: recipient!,
        trigger,
        provider: emailSettings.provider,
        status: "QUEUED",
      },
    });

    try {
      await this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENDING" } });

      const storage = await getStorageService();
      const pdfBuffer = await storage.download(invoice.pdfStorageKey);

      const companyName = shop.companyProfile?.companyName || shop.shopName || shop.shopDomain;
      const vars = {
        customer_name: invoice.customerName,
        order_number: String(invoice.shopifyOrderNumber),
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.invoiceDate.toDateString(),
        total: formatMoney(toDecimal(invoice.total.toString()), invoice.currency),
        currency: invoice.currency,
        company_name: companyName,
        support_email: shop.companyProfile?.email || emailSettings.replyTo || emailSettings.senderEmail || "",
        shop_url: `https://${shop.shopDomain}`,
      };

      const { html, text } = buildEmailBody(
        { greeting: emailSettings.greetingTemplate, body: emailSettings.bodyTemplate, footer: emailSettings.footerTemplate },
        vars,
      );
      let subject = renderSubject(emailSettings.subjectTemplate, vars);
      if (testMode) subject = `[TEST MODE] ${subject}`;

      const provider = await getEmailProvider(emailSettings.provider);
      const fromAddress = emailSettings.senderEmail
        ? emailSettings.senderName
          ? `${emailSettings.senderName} <${emailSettings.senderEmail}>`
          : emailSettings.senderEmail
        : (() => {
            throw Errors.invalidConfiguration("Configure a sender email in Settings → Email before enabling automatic invoice emails.");
          })();

      const result = await provider.sendEmail({
        to: recipient!,
        from: fromAddress,
        replyTo: emailSettings.replyTo || undefined,
        subject,
        html,
        text,
        attachments: [{ filename: invoicePdfFilename(invoice.invoiceNumber), content: pdfBuffer, contentType: "application/pdf" }],
      });

      const now = new Date();
      const updated = await this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", providerMessageId: result.providerMessageId, sentAt: now },
      });

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { emailStatus: "SENT", emailSentAt: now, emailStatusReason: null },
      });

      await recordAuditLog(this.prisma, {
        shopId: shop.id,
        action: trigger === "MANUAL_RESEND" ? "invoice.resent" : "email.sent",
        entityType: "Invoice",
        entityId: invoiceId,
        metadata: { deliveryId: delivery.id, recipient, testMode },
      });

      return updated;
    } catch (error) {
      await this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
          retryCount: { increment: 1 },
        },
      });
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { emailStatus: "FAILED" } });
      throw error;
    }
  }

  async resendInvoice(invoiceId: string): Promise<EmailDelivery | null> {
    return this.sendInvoice(invoiceId, "MANUAL_RESEND");
  }

  /** spec §53: send-test-email, gated behind merchant authentication in the route handler, not here. */
  async sendTestEmail(shopId: string, testRecipient: string): Promise<EmailDelivery> {
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      include: { companyProfile: true, emailSettings: true },
    });
    if (!shop.emailSettings) throw Errors.invalidConfiguration("Email settings have not been initialized for this shop.");

    const provider = await getEmailProvider(shop.emailSettings.provider);
    const companyName = shop.companyProfile?.companyName || shop.shopName || shop.shopDomain;

    const vars = {
      customer_name: "Jordan Sample",
      order_number: "1001",
      invoice_number: "INV-2026-000001",
      invoice_date: new Date().toDateString(),
      total: "USD 128.50",
      currency: "USD",
      company_name: companyName,
      support_email: shop.companyProfile?.email || shop.emailSettings.replyTo || "",
      shop_url: `https://${shop.shopDomain}`,
    };
    const { html, text } = buildEmailBody(
      {
        greeting: shop.emailSettings.greetingTemplate,
        body: shop.emailSettings.bodyTemplate,
        footer: shop.emailSettings.footerTemplate,
      },
      vars,
    );
    const subject = `[TEST] ${renderSubject(shop.emailSettings.subjectTemplate, vars)}`;
    const fromAddress = shop.emailSettings.senderEmail || "test@example.com";

    const delivery = await this.prisma.emailDelivery.create({
      data: {
        shopId,
        recipient: testRecipient,
        trigger: "TEST",
        provider: shop.emailSettings.provider,
        status: "QUEUED",
      },
    });

    try {
      const result = await provider.sendEmail({
        to: testRecipient,
        from: fromAddress,
        replyTo: shop.emailSettings.replyTo || undefined,
        subject,
        html,
        text,
        attachments: [],
      });
      return this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", sentAt: new Date(), providerMessageId: result.providerMessageId },
      });
    } catch (error) {
      await this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", failedAt: new Date(), errorMessage: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}

function renderSubject(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}
