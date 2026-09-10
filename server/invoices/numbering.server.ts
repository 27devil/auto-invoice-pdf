import { randomUUID } from "node:crypto";
import type { PrismaClient, InvoiceNumberResetPolicy } from "@prisma/client";

export interface NumberingConfig {
  prefix: string;
  format: string; // e.g. "{PREFIX}-{YEAR}-{SEQUENCE}"
  padding: number;
  startValue: number;
  resetPolicy: InvoiceNumberResetPolicy;
}

/** "ALL" for a continuous sequence, "2026" for a yearly reset, "2026-09" for monthly. */
export function computePeriodKey(resetPolicy: InvoiceNumberResetPolicy, now: Date, timeZone: string): string {
  if (resetPolicy === "NEVER") return "ALL";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;

  return resetPolicy === "MONTHLY" ? `${year}-${month}` : year;
}

/**
 * Atomically allocates the next sequence number for a shop+period using a
 * single INSERT ... ON CONFLICT DO UPDATE ... RETURNING statement, so two
 * orders created in the same millisecond can never receive the same number
 * (spec §8: "Two simultaneous orders must NEVER receive the same invoice
 * number"). See docs/architecture.md §Invoice numbering for the arithmetic.
 */
export async function allocateNextSequenceValue(
  prisma: PrismaClient,
  shopId: string,
  periodKey: string,
  startValue: number,
): Promise<number> {
  const id = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ allocated: bigint | number }>>`
    INSERT INTO "InvoiceNumberSequence" ("id", "shopId", "periodKey", "nextValue", "updatedAt")
    VALUES (${id}, ${shopId}, ${periodKey}, ${startValue} + 1, now())
    ON CONFLICT ("shopId", "periodKey")
    DO UPDATE SET "nextValue" = "InvoiceNumberSequence"."nextValue" + 1, "updatedAt" = now()
    RETURNING "nextValue" - 1 AS allocated
  `;

  return Number(rows[0].allocated);
}

export function formatInvoiceNumber(config: NumberingConfig, sequenceValue: number, periodKey: string, now: Date, timeZone: string): string {
  const padded = String(sequenceValue).padStart(config.padding, "0");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;

  return config.format
    .replace("{PREFIX}", config.prefix)
    .replace("{YEAR}", year)
    .replace("{MONTH}", month)
    .replace("{PERIOD}", periodKey)
    .replace("{SEQUENCE}", padded);
}

/** High-level helper: allocate + format in one call. */
export async function generateInvoiceNumber(
  prisma: PrismaClient,
  shopId: string,
  config: NumberingConfig,
  timeZone: string,
  now: Date = new Date(),
): Promise<string> {
  const periodKey = computePeriodKey(config.resetPolicy, now, timeZone);
  const sequenceValue = await allocateNextSequenceValue(prisma, shopId, periodKey, config.startValue);
  return formatInvoiceNumber(config, sequenceValue, periodKey, now, timeZone);
}
