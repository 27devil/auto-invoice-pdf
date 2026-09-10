import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recordWebhookEvent, markWebhookEventStatus } from "../../server/webhooks/idempotency.server";

/**
 * Recorded for idempotency/audit purposes today (spec §9 lists this topic
 * as "potential"/"where useful"). No invoice mutation happens here yet — an
 * order edit after invoicing intentionally does not rewrite a generated
 * invoice (same principle as spec §89 for cancellations). Hook point for a
 * future "flag as out of date" feature.
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
  if (!isDuplicate && eventId) await markWebhookEventStatus(prisma, eventId, "PROCESSED");

  return new Response();
};
