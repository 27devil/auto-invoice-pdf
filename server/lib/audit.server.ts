import type { PrismaClient, Prisma } from "@prisma/client";

/** Central audit-log writer (spec §41). Never throws — a failed audit write
 * should never fail the primary operation it's describing. */
export async function recordAuditLog(
  prisma: PrismaClient,
  entry: {
    shopId: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    actor?: string;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        shopId: entry.shopId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        actor: entry.actor ?? "system",
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", event: "audit_log.write_failed", error: String(error) }));
  }
}
