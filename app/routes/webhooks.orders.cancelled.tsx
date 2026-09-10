import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recordWebhookEvent, markWebhookEventStatus } from "../../server/webhooks/idempotency.server";
import { recordAuditLog } from "../../server/lib/audit.server";
import { logger } from "../../server/lib/logger.server";

/**
 * spec §89: cancelling an order after its invoice exists must never
 * silently rewrite the historical invoice/PDF. This just flags the invoice
 * CANCELLED — the original PDF and numbers are untouched. Generating a
 * cancellation/credit document is a future feature (spec §29/§90).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, topic, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? `missing-${crypto.randomUUID()}`;

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  const { isDuplicate, eventId } = await recordWebhookEvent(prisma, {
    shopId: shop?.id ?? null,
    shopDomain,
    webhookId,
    topic,
    payload,
  });
  if (isDuplicate || !shop) return new Response();

  const body = payload as Record<string, unknown>;
  const shopifyOrderId = String(body.id ?? "");

  const invoice = await prisma.invoice.findUnique({
    where: { shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId } },
  });

  if (invoice && invoice.invoiceStatus !== "CANCELLED") {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { invoiceStatus: "CANCELLED", cancelledAt: new Date() },
    });
    await recordAuditLog(prisma, {
      shopId: shop.id,
      action: "invoice.cancelled",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { reason: "order_cancelled" },
    });
    logger.info("invoice.cancelled_via_order_cancellation", { invoiceId: invoice.id, shopifyOrderId });
  }

  if (eventId) await markWebhookEventStatus(prisma, eventId, "PROCESSED");
  return new Response();
};
