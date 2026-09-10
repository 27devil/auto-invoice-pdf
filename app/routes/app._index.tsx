import type { ReactNode } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { formatMoney, toDecimal, sum } from "../../server/lib/money.server";

function windowStart(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });

  const [last24h, last7d, last30d, failedCount, sentEmailCount, recentInvoices, testModeSettings] = await Promise.all([
    prisma.invoice.findMany({ where: { shopId: shop.id, createdAt: { gte: windowStart(24) } }, select: { total: true } }),
    prisma.invoice.findMany({ where: { shopId: shop.id, createdAt: { gte: windowStart(24 * 7) } }, select: { total: true } }),
    prisma.invoice.findMany({ where: { shopId: shop.id, createdAt: { gte: windowStart(24 * 30) } }, select: { total: true } }),
    prisma.invoice.count({ where: { shopId: shop.id, invoiceStatus: "FAILED" } }),
    prisma.emailDelivery.count({ where: { shopId: shop.id, status: { in: ["SENT", "DELIVERED"] } } }),
    prisma.invoice.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        invoiceNumber: true,
        shopifyOrderNumber: true,
        customerName: true,
        invoiceDate: true,
        total: true,
        currency: true,
        invoiceStatus: true,
        emailStatus: true,
        paymentStatus: true,
      },
    }),
    prisma.storeSettings.findUnique({ where: { shopId: shop.id }, select: { testModeEnabled: true } }),
  ]);

  const revenue30d = sum(last30d.map((i) => toDecimal(i.total.toString())));

  return {
    shopCurrency: shop.currency,
    metrics: {
      invoices24h: last24h.length,
      invoices7d: last7d.length,
      invoices30d: last30d.length,
      failedCount,
      sentEmailCount,
      revenue30d: formatMoney(revenue30d, shop.currency),
    },
    recentInvoices: recentInvoices.map((i) => ({
      ...i,
      invoiceDate: i.invoiceDate.toISOString(),
      totalLabel: formatMoney(toDecimal(i.total.toString()), i.currency),
    })),
    testModeEnabled: testModeSettings?.testModeEnabled ?? true,
  };
};

const STATUS_TONE: Record<string, string> = {
  GENERATED: "success",
  GENERATING: "info",
  FAILED: "critical",
  CANCELLED: "neutral",
};

const EMAIL_TONE: Record<string, string> = {
  SENT: "success",
  DELIVERED: "success",
  QUEUED: "info",
  SENDING: "info",
  FAILED: "critical",
  BOUNCED: "critical",
  NOT_SENT: "neutral",
};

export default function Dashboard() {
  const { metrics, recentInvoices, testModeEnabled } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Auto Invoice PDF">
      <s-button slot="primary-action" href="/app/invoices">
        View all invoices
      </s-button>

      {testModeEnabled && (
        <s-banner tone="warning" heading="Test mode is enabled">
          <s-paragraph>
            Invoices are generated normally, but emails are only sent to your configured test address — real
            customers will not receive anything. Turn this off in{" "}
            <s-link href="/app/settings">Settings → Email</s-link> when you&apos;re ready to go live.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Overview">
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
          <MetricCard label="Invoices (24h)" value={String(metrics.invoices24h)} />
          <MetricCard label="Invoices (7 days)" value={String(metrics.invoices7d)} />
          <MetricCard label="Invoices (30 days)" value={String(metrics.invoices30d)} />
          <MetricCard label="Revenue invoiced (30 days)" value={metrics.revenue30d} />
        </s-grid>
        <div style={{ marginTop: "12px" }}>
          <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
            <MetricCard label="Emails sent (all time)" value={String(metrics.sentEmailCount)} />
            <MetricCard label="Failed invoices" value={String(metrics.failedCount)} tone={metrics.failedCount > 0 ? "critical" : undefined} />
          </s-grid>
        </div>
      </s-section>

      <s-section heading="Recent invoices">
        {recentInvoices.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>No invoices yet. Your first invoice will appear automatically after an order is created.</s-paragraph>
            <s-button href="/app/settings" variant="tertiary">
              Configure invoices
            </s-button>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e1e3e5" }}>
                  <Th>Invoice</Th>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Date</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>Email</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                    <Td>{invoice.invoiceNumber}</Td>
                    <Td>#{invoice.shopifyOrderNumber}</Td>
                    <Td>{invoice.customerName}</Td>
                    <Td>{new Date(invoice.invoiceDate).toLocaleDateString()}</Td>
                    <Td>{invoice.totalLabel}</Td>
                    <Td>
                      <s-badge tone={STATUS_TONE[invoice.invoiceStatus] as never}>{invoice.invoiceStatus}</s-badge>
                    </Td>
                    <Td>
                      <s-badge tone={EMAIL_TONE[invoice.emailStatus] as never}>{invoice.emailStatus}</s-badge>
                    </Td>
                    <Td>
                      <s-link href={`/app/invoices/${invoice.id}`}>View</s-link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-paragraph>
          Every new order triggers an <s-text type="strong">orders/create</s-text> webhook, which queues PDF
          generation and (if enabled) an invoice email — see{" "}
          <s-link href="/app/settings">Settings</s-link> to configure company details, numbering, tax, and email
          delivery.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="small-200">
        <s-text tone={(tone as never) ?? undefined} color="subdued">
          {label}
        </s-text>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-box>
  );
}

function Th({ children }: { children?: ReactNode }) {
  return <th style={{ padding: "8px 12px", fontWeight: 600, color: "#6b7680", fontSize: "11px", textTransform: "uppercase" }}>{children}</th>;
}
function Td({ children }: { children?: ReactNode }) {
  return <td style={{ padding: "10px 12px" }}>{children}</td>;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
