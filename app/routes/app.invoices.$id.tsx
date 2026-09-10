import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { formatMoney, toDecimal } from "../../server/lib/money.server";
import { enqueueRegenerateInvoice, enqueueSendInvoiceEmail } from "../../server/queue/jobs";
import { invoicePdfFilename } from "../../server/storage/index.server";
import { recordAuditLog } from "../../server/lib/audit.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });

  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { id: params.id, shopId: shop.id }, // tenant isolation: never trust the URL param alone (spec §32)
    include: { items: true, emailDeliveries: { orderBy: { createdAt: "desc" } } },
  });

  return {
    invoice: {
      ...invoice,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
      totalLabel: formatMoney(toDecimal(invoice.total.toString()), invoice.currency),
      subtotalLabel: formatMoney(toDecimal(invoice.subtotal.toString()), invoice.currency),
      taxLabel: formatMoney(toDecimal(invoice.taxTotal.toString()), invoice.currency),
      discountLabel: formatMoney(toDecimal(invoice.discountTotal.toString()), invoice.currency),
      shippingLabel: formatMoney(toDecimal(invoice.shippingTotal.toString()), invoice.currency),
      balanceDueLabel: formatMoney(toDecimal(invoice.balanceDue.toString()), invoice.currency),
      items: invoice.items.map((i) => ({
        ...i,
        unitPrice: formatMoney(toDecimal(i.unitPrice.toString()), invoice.currency),
        lineTotal: formatMoney(toDecimal(i.lineTotal.toString()), invoice.currency),
      })),
      emailDeliveries: invoice.emailDeliveries.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    },
    downloadFilename: invoicePdfFilename(invoice.invoiceNumber),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: params.id, shopId: shop.id } });

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "resend") {
    const job = await enqueueSendInvoiceEmail({ invoiceId: invoice.id });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { currentJobId: job.id } });
    await recordAuditLog(prisma, { shopId: shop.id, action: "invoice.resend_requested", entityType: "Invoice", entityId: invoice.id, actor: session.onlineAccessInfo?.associated_user?.email ?? "merchant" });
    return { ok: true, message: "Resend queued." };
  }

  if (intent === "regenerate") {
    const job = await enqueueRegenerateInvoice({ invoiceId: invoice.id });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { currentJobId: job.id } });
    await recordAuditLog(prisma, { shopId: shop.id, action: "invoice.regenerate_requested", entityType: "Invoice", entityId: invoice.id, actor: session.onlineAccessInfo?.associated_user?.email ?? "merchant" });
    return { ok: true, message: "Regeneration queued." };
  }

  return { ok: false, message: "Unknown action." };
};

export default function InvoiceDetail() {
  const { invoice, downloadFilename } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const busy = fetcher.state !== "idle";

  return (
    <s-page heading={`Invoice ${invoice.invoiceNumber}`}>
      <s-button slot="primary-action" href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
        Download PDF
      </s-button>
      <s-button slot="secondary-actions" variant="tertiary" onClick={() => navigate("/app/invoices")}>
        Back to invoices
      </s-button>
      <s-button
        slot="secondary-actions"
        variant="tertiary"
        onClick={() => fetcher.submit({ intent: "resend" }, { method: "post" })}
        {...(busy ? { loading: true } : {})}
      >
        Resend invoice
      </s-button>
      <s-button
        slot="secondary-actions"
        variant="tertiary"
        onClick={() => fetcher.submit({ intent: "regenerate" }, { method: "post" })}
        {...(busy ? { loading: true } : {})}
      >
        Regenerate PDF
      </s-button>

      {fetcher.data?.message && (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>
          <s-paragraph>{fetcher.data.message}</s-paragraph>
        </s-banner>
      )}

      {invoice.invoiceStatus === "FAILED" && (
        <s-banner tone="critical" heading="Invoice generation failed">
          <s-paragraph>We couldn&apos;t generate this invoice. It will retry automatically, or you can regenerate it manually above.</s-paragraph>
        </s-banner>
      )}
      {invoice.emailStatusReason === "CUSTOMER_EMAIL_MISSING" && (
        <s-banner tone="warning" heading="No email on file">
          <s-paragraph>This order has no email address, so the invoice was generated but never sent. Download it above to send manually.</s-paragraph>
        </s-banner>
      )}

      <s-section heading="Summary">
        <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="base">
          <div>
            <s-text color="subdued">Order</s-text>
            <s-paragraph>#{invoice.shopifyOrderNumber}</s-paragraph>
            <s-text color="subdued">Customer</s-text>
            <s-paragraph>
              {invoice.customerName}
              {invoice.customerEmail ? ` · ${invoice.customerEmail}` : ""}
            </s-paragraph>
            <s-text color="subdued">Invoice date</s-text>
            <s-paragraph>{new Date(invoice.invoiceDate).toLocaleDateString()}</s-paragraph>
          </div>
          <div>
            <s-text color="subdued">Status</s-text>
            <s-paragraph>
              <s-badge>{invoice.invoiceStatus}</s-badge> <s-badge>{invoice.paymentStatus}</s-badge>{" "}
              <s-badge>{invoice.emailStatus}</s-badge>
            </s-paragraph>
            <s-text color="subdued">Total</s-text>
            <s-paragraph>{invoice.totalLabel}</s-paragraph>
            <s-text color="subdued">Balance due</s-text>
            <s-paragraph>{invoice.balanceDueLabel}</s-paragraph>
          </div>
        </s-grid>
      </s-section>

      <s-section heading="Line items">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ padding: "6px 10px" }}>Item</th>
                <th style={{ padding: "6px 10px" }}>SKU</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Qty</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Unit price</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                  <td style={{ padding: "8px 10px" }}>
                    {item.productTitle}
                    {item.variantTitle ? <div style={{ color: "#8a97a3", fontSize: 11 }}>{item.variantTitle}</div> : null}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{item.sku || "N/A"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{item.quantity}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{item.unitPrice}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{item.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-section>

      <s-section heading="PDF preview">
        <iframe
          src={`/api/invoices/${invoice.id}/pdf`}
          title={downloadFilename}
          style={{ width: "100%", height: "600px", border: "1px solid #e1e3e5", borderRadius: 8 }}
        />
      </s-section>

      <s-section slot="aside" heading="Activity">
        <s-stack direction="block" gap="small-200">
          {invoice.emailDeliveries.length === 0 ? (
            <s-text color="subdued">No email activity yet.</s-text>
          ) : (
            invoice.emailDeliveries.map((d) => (
              <s-box key={d.id} padding="small-200" borderWidth="base" borderRadius="base">
                <s-text type="strong">
                  {d.trigger} · {d.status}
                </s-text>
                <s-paragraph>
                  To {d.recipient} — {new Date(d.createdAt).toLocaleString()}
                  {d.errorMessage ? ` — ${d.errorMessage}` : ""}
                </s-paragraph>
              </s-box>
            ))
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
