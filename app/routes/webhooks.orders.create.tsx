import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recordWebhookEvent, markWebhookEventStatus } from "../../server/webhooks/idempotency.server";
import { enqueueGenerateInvoice } from "../../server/queue/jobs";
import { getOrInitShopSettings } from "../../server/settings/SettingsService.server";
import { logger } from "../../server/lib/logger.server";

/**
 * Core workflow trigger (spec §9). Validates via Shopify's own HMAC
 * verification (authenticate.webhook — spec §92: never hand-roll signature
 * checks), persists the event for idempotency, enqueues the heavy work, and
 * returns immediately. No order fetch, PDF render, or email send happens
 * inline here (spec §58).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, topic, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? `missing-${crypto.randomUUID()}`;

  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain },
  });
  await getOrInitShopSettings(prisma, shop.id);

  const { isDuplicate, eventId } = await recordWebhookEvent(prisma, {
    shopId: shop.id,
    shopDomain,
    webhookId,
    topic,
    payload,
  });

  if (isDuplicate) {
    // Same webhook delivered twice — do not re-enqueue, do not re-invoice, do not re-email (spec §34).
    return new Response();
  }

  const body = payload as Record<string, unknown>;
  const orderGid = (body.admin_graphql_api_id as string) || `gid://shopify/Order/${body.id}`;

  try {
    await enqueueGenerateInvoice({ shopId: shop.id, shopDomain, orderGid, webhookEventId: eventId ?? undefined });
    if (eventId) await markWebhookEventStatus(prisma, eventId, "PROCESSED");
  } catch (error) {
    logger.error("webhook.orders_create.enqueue_failed", { shopDomain, orderGid, error: String(error) });
    if (eventId) await markWebhookEventStatus(prisma, eventId, "FAILED", error instanceof Error ? error.message : String(error));
    // Nothing was queued — let Shopify redeliver rather than silently dropping the order.
    return new Response("Failed to enqueue invoice generation", { status: 500 });
  }

  return new Response();
};
