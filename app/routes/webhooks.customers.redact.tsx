import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { recordAuditLog } from "../../server/lib/audit.server";
import { logger } from "../../server/lib/logger.server";

/**
 * Mandatory GDPR compliance webhook (spec §33, §96) — see
 * webhooks.customers.data_request.tsx for the distribution note.
 *
 * Redacts the customer's PII from any Invoice rows matched by email, while
 * deliberately preserving the financial figures (totals, line items,
 * invoice number) — those are accounting records, not personal data, and
 * merchants generally have a legal obligation to retain them regardless of
 * a redaction request.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, payload, topic } = await authenticate.webhook(request);
  const body = payload as { customer?: { id?: number; email?: string } };
  const email = body.customer?.email;

  logger.info("webhook.customers_redact", { shopDomain, topic, customerEmail: email });

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (shop && email) {
    const { count } = await db.invoice.updateMany({
      where: { shopId: shop.id, customerEmail: email },
      data: {
        customerName: "Redacted customer",
        customerEmail: null,
        customerPhone: null,
        billingAddress: { redacted: true },
        shippingAddress: { redacted: true },
        customerTaxId: null,
      },
    });
    await db.customer.deleteMany({ where: { shopId: shop.id, email } });
    await recordAuditLog(db, {
      shopId: shop.id,
      action: "gdpr.customer_redacted",
      metadata: { invoicesRedacted: count, shopifyCustomerId: body.customer?.id },
    });
  }

  return new Response();
};
