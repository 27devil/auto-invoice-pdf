import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { recordWebhookEvent } from "../../server/webhooks/idempotency.server";

/**
 * spec §34: "If same event arrives again: DO NOT process it twice." The
 * real safety net is the UNIQUE constraint on shopifyWebhookId — this test
 * simulates Postgres rejecting the second insert with a P2002 violation,
 * which is exactly what happens when two webhook deliveries race each other.
 */
function makeFakePrisma(seenIds: Set<string>) {
  return {
    webhookEvent: {
      create: vi.fn(async ({ data }: { data: { shopifyWebhookId: string } }) => {
        if (seenIds.has(data.shopifyWebhookId)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`shopifyWebhookId`)", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        seenIds.add(data.shopifyWebhookId);
        return { id: `event_${data.shopifyWebhookId}` };
      }),
    },
  } as unknown as PrismaClient;
}

describe("recordWebhookEvent", () => {
  it("accepts the first delivery of a webhook", async () => {
    const prisma = makeFakePrisma(new Set());
    const result = await recordWebhookEvent(prisma, {
      shopId: "shop_1",
      shopDomain: "test.myshopify.com",
      webhookId: "wh_abc123",
      topic: "orders/create",
      payload: { id: 1 },
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.eventId).toBeTruthy();
  });

  it("rejects a redelivered webhook with the same X-Shopify-Webhook-Id", async () => {
    const seenIds = new Set<string>();
    const prisma = makeFakePrisma(seenIds);

    const first = await recordWebhookEvent(prisma, {
      shopId: "shop_1",
      shopDomain: "test.myshopify.com",
      webhookId: "wh_abc123",
      topic: "orders/create",
      payload: { id: 1 },
    });
    const second = await recordWebhookEvent(prisma, {
      shopId: "shop_1",
      shopDomain: "test.myshopify.com",
      webhookId: "wh_abc123",
      topic: "orders/create",
      payload: { id: 1 },
    });

    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(true);
    expect(second.eventId).toBeNull();
  });

  it("treats webhooks with different ids as independent even with identical payloads", async () => {
    const seenIds = new Set<string>();
    const prisma = makeFakePrisma(seenIds);

    const a = await recordWebhookEvent(prisma, {
      shopId: "shop_1",
      shopDomain: "test.myshopify.com",
      webhookId: "wh_1",
      topic: "orders/create",
      payload: { id: 1 },
    });
    const b = await recordWebhookEvent(prisma, {
      shopId: "shop_1",
      shopDomain: "test.myshopify.com",
      webhookId: "wh_2",
      topic: "orders/create",
      payload: { id: 1 },
    });

    expect(a.isDuplicate).toBe(false);
    expect(b.isDuplicate).toBe(false);
  });
});
