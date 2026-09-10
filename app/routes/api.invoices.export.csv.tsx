import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { formatMoney, toDecimal } from "../../server/lib/money.server";

const COLUMNS = [
  "Invoice number",
  "Order number",
  "Date",
  "Customer",
  "Email",
  "Subtotal",
  "Discount",
  "Tax",
  "Shipping",
  "Total",
  "Payment status",
  "Email status",
] as const;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** spec §84: CSV export of the current invoice list. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });

  const invoices = await prisma.invoice.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" } });

  const rows = invoices.map((i) =>
    [
      i.invoiceNumber,
      String(i.shopifyOrderNumber),
      i.invoiceDate.toISOString().slice(0, 10),
      i.customerName,
      i.customerEmail ?? "",
      formatMoney(toDecimal(i.subtotal.toString()), i.currency),
      formatMoney(toDecimal(i.discountTotal.toString()), i.currency),
      formatMoney(toDecimal(i.taxTotal.toString()), i.currency),
      formatMoney(toDecimal(i.shippingTotal.toString()), i.currency),
      formatMoney(toDecimal(i.total.toString()), i.currency),
      i.paymentStatus,
      i.emailStatus,
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [COLUMNS.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices-${shop.shopDomain}.csv"`,
    },
  });
};
