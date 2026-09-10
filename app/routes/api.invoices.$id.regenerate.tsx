import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueRegenerateInvoice } from "../../server/queue/jobs";
import { recordAuditLog } from "../../server/lib/audit.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: params.id, shopId: shop.id } });

  const job = await enqueueRegenerateInvoice({ invoiceId: invoice.id });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { currentJobId: job.id } });
  await recordAuditLog(prisma, {
    shopId: shop.id,
    action: "invoice.regenerate_requested",
    entityType: "Invoice",
    entityId: invoice.id,
    actor: session.onlineAccessInfo?.associated_user?.email ?? "merchant",
  });

  return { ok: true, jobId: job.id };
};
