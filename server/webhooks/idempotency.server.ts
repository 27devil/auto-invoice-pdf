import { createHash } from "node:crypto";
import type { PrismaClient, WebhookEventStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { logger } from "../lib/logger.server";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Webhook idempotency (spec §34): the row's UNIQUE constraint on
 * shopifyWebhookId is what actually makes this race-safe — two concurrent
 * deliveries of the same webhook both attempt the insert, exactly one wins,
 * the loser gets a P2002 and is treated as a duplicate. A pre-check
 * (`findFirst` then `create`) would have a race window; this doesn't.
 */
export async function recordWebhookEvent(
  prisma: PrismaClient,
  params: { shopId: string | null; shopDomain: string; webhookId: string; topic: string; payload: unknown },
): Promise<{ isDuplicate: boolean; eventId: string | null }> {
  const payloadHash = createHash("sha256").update(JSON.stringify(params.payload)).digest("hex");

  try {
    const event = await prisma.webhookEvent.create({
      data: {
        shopId: params.shopId,
        shopDomain: params.shopDomain,
        shopifyWebhookId: params.webhookId,
        topic: params.topic,
        payloadHash,
        status: "RECEIVED",
      },
    });
    return { isDuplicate: false, eventId: event.id };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      logger.info("webhook.duplicate_detected", { webhookId: params.webhookId, topic: params.topic });
      return { isDuplicate: true, eventId: null };
    }
    throw error;
  }
}

export async function markWebhookEventStatus(
  prisma: PrismaClient,
  eventId: string,
  status: WebhookEventStatus,
  errorMessage?: string,
): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status, processedAt: new Date(), errorMessage: errorMessage ?? null },
  });
}
