import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { recordAuditLog } from "../../server/lib/audit.server";
import { logger } from "../../server/lib/logger.server";

/**
 * Mandatory GDPR compliance webhook (spec §33, §96) — only required for
 * public/App Store-distributed apps; the subscription is commented out in
 * shopify.app.toml until this app changes distribution. Handler is wired up
 * and audit-logs the request now so enabling distribution later is a
 * one-line config change, not new code.
 *
 * This app stores the customer data an invoice needs (name, email, phone,
 * billing/shipping address) on the Invoice row — see docs/architecture.md
 * §Data retention for what to hand the merchant if you build a self-serve
 * export here.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, payload, topic } = await authenticate.webhook(request);
  const body = payload as { customer?: { id?: number; email?: string } };

  logger.info("webhook.customers_data_request", { shopDomain, topic, customerEmail: body.customer?.email });

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (shop) {
    await recordAuditLog(db, {
      shopId: shop.id,
      action: "gdpr.customer_data_requested",
      metadata: { customerEmail: body.customer?.email, shopifyCustomerId: body.customer?.id },
    });
  }

  return new Response();
};
