import type { InvoicePdfData, InvoicePdfAddress } from "./types";

function esc(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function addressBlock(label: string, address: InvoicePdfAddress | null, extra: string[]): string {
  if (!address) return "";
  const lines = [
    address.name,
    address.company,
    address.address1,
    address.address2,
    [address.city, address.province, address.zip].filter(Boolean).join(", "),
    address.country,
    ...extra,
  ].filter(Boolean) as string[];

  return `
    <div class="address-block">
      <div class="address-label">${esc(label)}</div>
      ${lines.map((line) => `<div>${esc(line)}</div>`).join("")}
    </div>
  `;
}

const SAFE_FONTS: Record<string, string> = {
  Helvetica: `Helvetica, Arial, sans-serif`,
  Georgia: `Georgia, "Times New Roman", serif`,
  "Times New Roman": `"Times New Roman", Times, serif`,
  Verdana: `Verdana, Geneva, sans-serif`,
};

export function renderInvoiceHtml(data: InvoicePdfData): string {
  const fontStack = SAFE_FONTS[data.design.fontFamily] ?? SAFE_FONTS.Helvetica;
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(data.design.accentColor) ? data.design.accentColor : "#1A1A1A";

  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        ${
          data.design.showProductImage
            ? `<td class="col-image">${
                item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" />` : ""
              }</td>`
            : ""
        }
        <td class="col-product">
          <div class="product-title">${esc(item.productTitle)}</div>
          ${item.variantTitle ? `<div class="product-variant">${esc(item.variantTitle)}</div>` : ""}
          ${data.design.showSku ? `<div class="product-sku">SKU: ${esc(item.sku || "N/A")}</div>` : ""}
        </td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-price">${esc(item.unitPrice)}</td>
        ${data.design.showDiscount ? `<td class="col-discount">${esc(item.discountAmount)}</td>` : ""}
        ${data.design.showTax ? `<td class="col-tax">${esc(item.taxAmount)}</td>` : ""}
        <td class="col-total">${esc(item.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const colCount =
    2 + (data.design.showProductImage ? 1 : 0) + (data.design.showDiscount ? 1 : 0) + (data.design.showTax ? 1 : 0) + 2;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${esc(data.invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${fontStack};
    font-size: 10.5px;
    color: #1f2328;
    line-height: 1.5;
  }
  .page { padding: 36px 40px 24px 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${accent}; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { display: flex; gap: 14px; align-items: flex-start; }
  .brand img { max-height: 56px; max-width: 180px; object-fit: contain; }
  .brand-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .brand-meta { color: #55606b; font-size: 9.5px; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 22px; font-weight: 800; letter-spacing: 0.04em; color: ${accent}; margin-bottom: 8px; }
  .invoice-meta table { border-collapse: collapse; }
  .invoice-meta td { padding: 1px 0; font-size: 10px; }
  .invoice-meta td.label { color: #55606b; padding-right: 10px; text-align: right; }
  .status-pill { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 12px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.03em; background: #e7f6ec; color: #146c3a; }
  .status-pill.pending { background: #fdf3d8; color: #8a5a00; }
  .status-pill.due { background: #fde8e8; color: #a3231f; }

  .addresses { display: flex; gap: 24px; margin-bottom: 22px; }
  .address-block { flex: 1; }
  .address-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: #8a97a3; margin-bottom: 6px; text-transform: uppercase; }

  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.items thead th {
    text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
    color: #ffffff; background: ${accent}; padding: 8px 10px;
  }
  table.items thead th.col-qty, table.items thead th.col-price, table.items thead th.col-discount,
  table.items thead th.col-tax, table.items thead th.col-total { text-align: right; }
  table.items tbody td { padding: 8px 10px; border-bottom: 1px solid #e8ebed; vertical-align: top; }
  table.items tbody tr { break-inside: avoid; }
  .col-qty, .col-price, .col-discount, .col-tax, .col-total { text-align: right; white-space: nowrap; }
  .col-image img { width: 34px; height: 34px; object-fit: cover; border-radius: 4px; }
  .product-title { font-weight: 600; }
  .product-variant, .product-sku { color: #6b7680; font-size: 9px; margin-top: 2px; }

  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 14px; break-inside: avoid; }
  .totals { width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10.5px; }
  .totals-row.grand { border-top: 2px solid ${accent}; margin-top: 6px; padding-top: 8px; font-size: 13px; font-weight: 800; }
  .totals-row.paid { color: #146c3a; }
  .totals-row.balance { font-weight: 700; }

  .lower-grid { display: flex; gap: 24px; margin-top: 26px; break-inside: avoid; }
  .lower-col { flex: 1; }
  .lower-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: #8a97a3; margin-bottom: 6px; text-transform: uppercase; }
  .lower-body { color: #3d4750; white-space: pre-wrap; }

  .footer-note { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e8ebed; color: #8a97a3; font-size: 9px; text-align: center; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        ${data.company.logoDataUrl ? `<img src="${data.company.logoDataUrl}" alt="${esc(data.company.companyName)} logo" />` : ""}
        <div>
          <div class="brand-name">${esc(data.company.companyName)}</div>
          <div class="brand-meta">
            ${data.company.addressLines.map((l) => esc(l)).join("<br/>")}
            ${data.company.phone ? `<br/>${esc(data.company.phone)}` : ""}
            ${data.company.email ? `<br/>${esc(data.company.email)}` : ""}
            ${data.company.website ? `<br/>${esc(data.company.website)}` : ""}
            ${data.company.taxId ? `<br/>${esc(data.company.taxIdLabel || "Tax ID")}: ${esc(data.company.taxId)}` : ""}
          </div>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">INVOICE</div>
        <table>
          <tr><td class="label">Invoice #</td><td>${esc(data.invoiceNumber)}</td></tr>
          <tr><td class="label">Order #</td><td>${esc(data.orderName)}</td></tr>
          <tr><td class="label">Invoice Date</td><td>${esc(data.invoiceDateLabel)}</td></tr>
          ${data.dueDateLabel ? `<tr><td class="label">Due Date</td><td>${esc(data.dueDateLabel)}</td></tr>` : ""}
          ${data.poNumber ? `<tr><td class="label">PO Number</td><td>${esc(data.poNumber)}</td></tr>` : ""}
        </table>
        <span class="status-pill">${esc(data.paymentStatusLabel)}</span>
      </div>
    </div>

    <div class="addresses">
      ${addressBlock(
        "Bill To",
        data.billingAddress,
        [
          // Avoid printing the company twice: the address block already
          // shows billingAddress.company when Shopify supplied one.
          data.design.showCompanyOnBill && data.companyName && data.companyName !== data.billingAddress?.company
            ? data.companyName
            : null,
          data.customerEmail,
          data.design.showCustomerPhone ? data.customerPhone : null,
          data.customerTaxId ? `Tax ID: ${data.customerTaxId}` : null,
        ].filter((v): v is string => Boolean(v)),
      )}
      ${data.shippingAddress ? addressBlock("Ship To", data.shippingAddress, []) : ""}
    </div>

    <table class="items">
      <thead>
        <tr>
          ${data.design.showProductImage ? `<th class="col-image"></th>` : ""}
          <th class="col-product">Item</th>
          <th class="col-qty">Qty</th>
          <th class="col-price">Unit Price</th>
          ${data.design.showDiscount ? `<th class="col-discount">Discount</th>` : ""}
          ${data.design.showTax ? `<th class="col-tax">Tax</th>` : ""}
          <th class="col-total">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || `<tr><td colspan="${colCount}" style="text-align:center;color:#8a97a3;padding:20px;">No line items</td></tr>`}
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals">
        <div class="totals-row"><span>Subtotal</span><span>${esc(data.subtotal)}</span></div>
        ${data.design.showDiscount ? `<div class="totals-row"><span>Discount</span><span>-${esc(data.discountTotal)}</span></div>` : ""}
        ${data.design.showShipping ? `<div class="totals-row"><span>Shipping</span><span>${esc(data.shippingTotal)}</span></div>` : ""}
        ${data.design.showTax ? `<div class="totals-row"><span>${esc(data.taxLabel)}</span><span>${esc(data.taxTotal)}</span></div>` : ""}
        <div class="totals-row grand"><span>Total</span><span>${esc(data.total)}</span></div>
        <div class="totals-row paid"><span>Amount Paid</span><span>${esc(data.amountPaid)}</span></div>
        <div class="totals-row balance"><span>Balance Due</span><span>${esc(data.balanceDue)}</span></div>
      </div>
    </div>

    <div class="lower-grid">
      ${
        data.design.showPaymentInfo && (data.design.showBankInfo ? data.company.bankDetails : null)
          ? `<div class="lower-col"><div class="lower-label">Payment Information</div><div class="lower-body">${esc(data.company.bankDetails)}</div></div>`
          : ""
      }
      ${
        data.design.showNotes && (data.design.defaultNotes || data.design.footerText)
          ? `<div class="lower-col"><div class="lower-label">Notes</div><div class="lower-body">${esc(
              data.design.defaultNotes || data.design.footerText,
            )}</div></div>`
          : ""
      }
      ${
        data.design.termsText
          ? `<div class="lower-col"><div class="lower-label">Terms &amp; Conditions</div><div class="lower-body">${esc(
              data.design.termsText,
            )}</div></div>`
          : ""
      }
    </div>

    <div class="footer-note">${esc(data.design.footerText)}</div>
  </div>
</body>
</html>`;
}
