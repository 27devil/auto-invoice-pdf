import type { PrismaClient, Shop } from "@prisma/client";
import { Errors } from "../lib/errors.server";

export type ShopWithSettings = Shop & {
  companyProfile: NonNullable<Awaited<ReturnType<PrismaClient["companyProfile"]["findUnique"]>>>;
  taxSettings: NonNullable<Awaited<ReturnType<PrismaClient["taxSettings"]["findUnique"]>>>;
  emailSettings: NonNullable<Awaited<ReturnType<PrismaClient["emailSettings"]["findUnique"]>>>;
  storeSettings: NonNullable<Awaited<ReturnType<PrismaClient["storeSettings"]["findUnique"]>>>;
  designSettings: NonNullable<Awaited<ReturnType<PrismaClient["invoiceDesignSettings"]["findUnique"]>>>;
};

/**
 * Ensures every settings row exists for a shop, creating defaults on first
 * touch (spec §71 "Default invoice settings"). Called on install and
 * defensively by anything that reads settings, so a partially-initialized
 * shop never crashes a webhook.
 */
export async function getOrInitShopSettings(prisma: PrismaClient, shopId: string): Promise<ShopWithSettings> {
  await prisma.$transaction([
    prisma.companyProfile.upsert({ where: { shopId }, create: { shopId }, update: {} }),
    prisma.taxSettings.upsert({ where: { shopId }, create: { shopId }, update: {} }),
    prisma.emailSettings.upsert({ where: { shopId }, create: { shopId }, update: {} }),
    prisma.storeSettings.upsert({ where: { shopId }, create: { shopId }, update: {} }),
    prisma.invoiceDesignSettings.upsert({ where: { shopId }, create: { shopId }, update: {} }),
  ]);

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { companyProfile: true, taxSettings: true, emailSettings: true, storeSettings: true, designSettings: true },
  });

  if (!shop || !shop.companyProfile || !shop.taxSettings || !shop.emailSettings || !shop.storeSettings || !shop.designSettings) {
    throw Errors.invalidConfiguration(`Failed to initialize settings for shop ${shopId}`);
  }

  return shop as ShopWithSettings;
}

/** spec §117: automatic email cannot be turned on without a usable provider config. */
export function validateEmailSettingsForAutoSend(emailSettings: { provider: string; senderEmail: string | null }): void {
  if (!emailSettings.senderEmail) {
    throw Errors.invalidConfiguration("Configure email before enabling automatic invoice emails.");
  }
  if (emailSettings.provider === "RESEND" && !process.env.RESEND_API_KEY) {
    throw Errors.invalidConfiguration("Configure email before enabling automatic invoice emails.");
  }
  if (emailSettings.provider === "SMTP" && !process.env.SMTP_HOST) {
    throw Errors.invalidConfiguration("Configure email before enabling automatic invoice emails.");
  }
}
