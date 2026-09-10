import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { getShop } from "../server/shopify/orderService";
import { getOrInitShopSettings } from "../server/settings/SettingsService.server";
import { logger } from "../server/lib/logger.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  // Built for a single merchant (Spill Ready Supplies) today. Flip to
  // AppDistribution.AppStore and uncomment the compliance webhooks in
  // shopify.app.toml before ever listing this app publicly — see
  // docs/shopify-setup.md §Distribution.
  distribution: AppDistribution.SingleMerchant,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      // First install (or re-auth): make sure our own tenant row + default
      // settings exist before any webhook can reference shopId (spec §4,
      // §6, §71). Shop currency/timezone/country come from Shopify itself,
      // never guessed.
      try {
        const shopInfo = await getShop(admin);
        const shop = await prisma.shop.upsert({
          where: { shopDomain: session.shop },
          create: {
            shopDomain: session.shop,
            shopifyShopGid: shopInfo.id,
            shopName: shopInfo.name,
            email: shopInfo.email,
            currency: shopInfo.currencyCode,
            timezone: shopInfo.ianaTimezone,
            country: shopInfo.country,
            uninstalledAt: null,
          },
          update: {
            shopifyShopGid: shopInfo.id,
            shopName: shopInfo.name,
            email: shopInfo.email,
            currency: shopInfo.currencyCode,
            timezone: shopInfo.ianaTimezone,
            country: shopInfo.country,
            uninstalledAt: null,
          },
        });
        await getOrInitShopSettings(prisma, shop.id);
        logger.info("shop.installed_or_reauthenticated", { shopDomain: session.shop });
      } catch (error) {
        // Never block the OAuth callback on this — settings lazily
        // initialize again the first time a webhook or the dashboard loads.
        logger.error("shop.afterAuth_bootstrap_failed", { shopDomain: session.shop, error: String(error) });
      }
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
