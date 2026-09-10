import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { formatMoney, toDecimal } from "../../server/lib/money.server";

/** spec §42/§43: read-only JSON listing API, same tenant-isolated query the admin UI uses. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });

  const url = new URL(request.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit") || 25));
  const cursor = url.searchParams.get("cursor") || undefined;

  const invoices = await prisma.invoice.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  return {
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      shopifyOrderNumber: i.shopifyOrderNumber,
      customerName: i.customerName,
      customerEmail: i.customerEmail,
      total: formatMoney(toDecimal(i.total.toString()), i.currency),
      currency: i.currency,
      invoiceStatus: i.invoiceStatus,
      emailStatus: i.emailStatus,
      paymentStatus: i.paymentStatus,
      invoiceDate: i.invoiceDate.toISOString(),
    })),
    nextCursor: invoices.length === limit ? invoices[invoices.length - 1].id : null,
  };
};
