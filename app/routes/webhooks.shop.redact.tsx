import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../../server/lib/logger.server";

/**
 * Mandatory GDPR compliance webhook (spec §33, §96) — see
 * webhooks.customers.data_request.tsx for the distribution note. Sent ~48h
 * after uninstall; deletes all of the shop's data. Prisma's onDelete:
 * Cascade on every child model (see prisma/schema.prisma) means deleting
 * the Shop row is sufficient — no manual fan-out needed.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, topic } = await authenticate.webhook(request);
  logger.info("webhook.shop_redact", { shopDomain, topic });

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (shop) {
    await db.shop.delete({ where: { id: shop.id } });
    logger.info("shop.data_deleted", { shopDomain });
  }

  return new Response();
};
