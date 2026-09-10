import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../../server/lib/logger.server";
import { recordAuditLog } from "../../server/lib/audit.server";

/**
 * Uninstall cleanup (spec §95): revoke sessions, mark the shop uninstalled so
 * nothing new is processed for it, and leave invoice/PDF/audit history in
 * place per the configured data-retention policy (spec §33) rather than
 * deleting it outright. Access tokens are dropped with the session rows —
 * that alone stops any further Shopify API access for this shop.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, session, topic } = await authenticate.webhook(request);

  logger.info("webhook.app_uninstalled", { shopDomain, topic });

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop: shopDomain } });
  }

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (shop && !shop.uninstalledAt) {
    await db.shop.update({ where: { id: shop.id }, data: { uninstalledAt: new Date() } });
    await recordAuditLog(db, { shopId: shop.id, action: "shop.uninstalled", metadata: { shopDomain } });
  }

  return new Response();
};
