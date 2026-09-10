import type { CSSProperties } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { formatMoney, toDecimal } from "../../server/lib/money.server";

const PAGE_SIZE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const status = url.searchParams.get("status") || "";
  const emailStatus = url.searchParams.get("emailStatus") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));

  const where: Prisma.InvoiceWhereInput = {
    shopId: shop.id,
    ...(status ? { invoiceStatus: status as Prisma.InvoiceWhereInput["invoiceStatus"] } : {}),
    ...(emailStatus ? { emailStatus: emailStatus as Prisma.InvoiceWhereInput["emailStatus"] } : {}),
    ...(q
      ? {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
            { shopifyOrderNumber: Number.isNaN(Number(q)) ? undefined : Number(q) },
            { items: { some: { sku: { contains: q, mode: "insensitive" } } } },
          ].filter(Boolean) as Prisma.InvoiceWhereInput[],
        }
      : {}),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      shopifyOrderNumber: i.shopifyOrderNumber,
      customerName: i.customerName,
      customerEmail: i.customerEmail,
      invoiceDate: i.invoiceDate.toISOString(),
      totalLabel: formatMoney(toDecimal(i.total.toString()), i.currency),
      paymentStatus: i.paymentStatus,
      invoiceStatus: i.invoiceStatus,
      emailStatus: i.emailStatus,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    filters: { q, status, emailStatus },
  };
};

export default function InvoicesList() {
  const { invoices, total, page, pageCount, filters } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  function updateFilter(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  }

  return (
    <s-page heading="Invoices">
      <s-section>
        <div style={{ marginBottom: "12px" }}>
        <s-stack direction="inline" gap="base">
          <input
            type="search"
            placeholder="Search invoice #, order #, customer, email, SKU"
            defaultValue={filters.q}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateFilter("q", (e.target as HTMLInputElement).value);
            }}
            style={{ padding: "8px 10px", border: "1px solid #c9cccf", borderRadius: 6, minWidth: 280, fontSize: 13 }}
          />
          <select
            defaultValue={filters.status}
            onChange={(e) => updateFilter("status", e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid #c9cccf", borderRadius: 6, fontSize: 13 }}
          >
            <option value="">All statuses</option>
            <option value="GENERATED">Generated</option>
            <option value="GENERATING">Generating</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            defaultValue={filters.emailStatus}
            onChange={(e) => updateFilter("emailStatus", e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid #c9cccf", borderRadius: 6, fontSize: 13 }}
          >
            <option value="">All email statuses</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="NOT_SENT">Not sent</option>
            <option value="FAILED">Failed</option>
            <option value="BOUNCED">Bounced</option>
          </select>
          <s-button href={`/api/invoices/export.csv`} variant="tertiary">
            Export CSV
          </s-button>
        </s-stack>
        </div>

        {invoices.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>No invoices yet. Your first invoice will appear automatically after an order is created.</s-paragraph>
            <s-button href="/app/settings" variant="tertiary">
              Configure invoices
            </s-button>
          </s-box>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e1e3e5" }}>
                    <th style={thStyle}>Invoice</th>
                    <th style={thStyle}>Order</th>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Total</th>
                    <th style={thStyle}>Payment</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      style={{ borderBottom: "1px solid #f1f2f3", cursor: "pointer" }}
                      onClick={() => navigate(`/app/invoices/${invoice.id}`)}
                    >
                      <td style={tdStyle}>{invoice.invoiceNumber}</td>
                      <td style={tdStyle}>#{invoice.shopifyOrderNumber}</td>
                      <td style={tdStyle}>
                        {invoice.customerName}
                        <div style={{ color: "#8a97a3", fontSize: 11 }}>{invoice.customerEmail}</div>
                      </td>
                      <td style={tdStyle}>{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                      <td style={tdStyle}>{invoice.totalLabel}</td>
                      <td style={tdStyle}>{invoice.paymentStatus}</td>
                      <td style={tdStyle}>{invoice.invoiceStatus}</td>
                      <td style={tdStyle}>{invoice.emailStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
            <s-stack direction="inline" gap="base" justifyContent="space-between">
              <s-text color="subdued">
                {total} invoice{total === 1 ? "" : "s"} — page {page} of {pageCount}
              </s-text>
              <s-stack direction="inline" gap="small-200">
                <s-button
                  variant="tertiary"
                  disabled={page <= 1}
                  onClick={() => setSearchParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(page - 1) }))}
                >
                  Previous
                </s-button>
                <s-button
                  variant="tertiary"
                  disabled={page >= pageCount}
                  onClick={() => setSearchParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(page + 1) }))}
                >
                  Next
                </s-button>
              </s-stack>
            </s-stack>
            </div>
          </>
        )}
      </s-section>
    </s-page>
  );
}

const thStyle: CSSProperties = { padding: "8px 12px", fontWeight: 600, color: "#6b7680", fontSize: "11px", textTransform: "uppercase" };
const tdStyle: CSSProperties = { padding: "10px 12px" };

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
