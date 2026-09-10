import type { Invoice, InvoiceItem, CompanyProfile, InvoiceDesignSettings, TaxSettings } from "@prisma/client";
import { formatMoney, toDecimal } from "../lib/money.server";
import type { InvoicePdfData, InvoicePdfAddress } from "./types";

function toPdfAddress(raw: unknown): InvoicePdfAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  return {
    name: (a.name as string) ?? null,
    company: (a.company as string) ?? null,
    address1: (a.address1 as string) ?? null,
    address2: (a.address2 as string) ?? null,
    city: (a.city as string) ?? null,
    province: (a.province as string) ?? null,
    zip: (a.zip as string) ?? null,
    country: (a.country as string) ?? null,
    phone: (a.phone as string) ?? null,
  };
}

function formatDate(date: Date, pattern: string): string {
  // Minimal formatter for the small set of tokens exposed in Settings →
  // Invoice → Date format. Falls back to an ISO date for anything unusual.
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(date.getDate()).padStart(2, "0");
  const MMM = months[date.getMonth()];
  const yyyy = String(date.getFullYear());
  if (pattern === "dd MMM yyyy") return `${dd} ${MMM} ${yyyy}`;
  if (pattern === "MMM dd, yyyy") return `${MMM} ${dd}, ${yyyy}`;
  if (pattern === "yyyy-MM-dd") return date.toISOString().slice(0, 10);
  return `${dd} ${MMM} ${yyyy}`;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  AUTHORIZED: "Authorized",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  PARTIALLY_REFUNDED: "Partially Refunded",
  REFUNDED: "Refunded",
  VOIDED: "Voided",
};

export interface MapInvoiceOptions {
  invoice: Invoice & { items: InvoiceItem[] };
  company: CompanyProfile;
  design: InvoiceDesignSettings;
  tax: TaxSettings;
  logoDataUrl: string | null; // pre-resolved by StorageService; PDF layer stays storage-agnostic
  dateFormat: string;
}

export function mapInvoiceToPdfData(options: MapInvoiceOptions): InvoicePdfData {
  const { invoice, company, design, tax, logoDataUrl, dateFormat } = options;
  const currency = invoice.currency;

  const addressLines = [company.addressLine1, company.addressLine2, [company.city, company.state, company.postalCode].filter(Boolean).join(", "), company.country].filter(
    (l): l is string => Boolean(l && l.length > 0),
  );

  return {
    invoiceNumber: invoice.invoiceNumber,
    orderName: `#${invoice.shopifyOrderNumber}`,
    invoiceDateLabel: formatDate(invoice.invoiceDate, dateFormat),
    dueDateLabel: invoice.dueDate ? formatDate(invoice.dueDate, dateFormat) : null,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[invoice.paymentStatus] ?? invoice.paymentStatus,
    currency,

    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerPhone: invoice.customerPhone,
    companyName: invoice.companyName,
    customerTaxId: invoice.customerTaxId,
    poNumber: invoice.poNumber,
    billingAddress: toPdfAddress(invoice.billingAddress),
    shippingAddress: toPdfAddress(invoice.shippingAddress),

    items: invoice.items
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        sku: item.sku,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: formatMoney(toDecimal(item.unitPrice.toString()), currency),
        discountAmount: formatMoney(toDecimal(item.discountAmount.toString()), currency),
        taxAmount: formatMoney(toDecimal(item.taxAmount.toString()), currency),
        lineTotal: formatMoney(toDecimal(item.lineTotal.toString()), currency),
      })),

    subtotal: formatMoney(toDecimal(invoice.subtotal.toString()), currency),
    discountTotal: formatMoney(toDecimal(invoice.discountTotal.toString()), currency),
    shippingTotal: formatMoney(toDecimal(invoice.shippingTotal.toString()), currency),
    taxTotal: formatMoney(toDecimal(invoice.taxTotal.toString()), currency),
    taxLabel: tax.defaultTaxLabel,
    total: formatMoney(toDecimal(invoice.total.toString()), currency),
    amountPaid: formatMoney(toDecimal(invoice.amountPaid.toString()), currency),
    balanceDue: formatMoney(toDecimal(invoice.balanceDue.toString()), currency),

    company: {
      companyName: company.companyName || "Your Company",
      legalBusinessName: company.legalBusinessName,
      logoDataUrl,
      addressLines,
      phone: company.phone,
      email: company.email,
      website: company.website,
      taxIdLabel: tax.showIndiaGstFields ? "GSTIN" : "Tax ID",
      taxId: company.taxId,
      registrationNumber: company.registrationNumber,
      bankDetails: company.bankDetails,
    },

    design: {
      accentColor: design.accentColor,
      fontFamily: design.fontFamily,
      showSku: design.showSku,
      showProductImage: design.showProductImage,
      showDiscount: design.showDiscount,
      showTax: design.showTax,
      showShipping: design.showShipping,
      showCustomerPhone: design.showCustomerPhone,
      showCompanyOnBill: design.showCompanyOnBill,
      showPaymentInfo: design.showPaymentInfo,
      showBankInfo: design.showBankInfo,
      showNotes: design.showNotes,
      footerText: design.footerText,
      termsText: design.termsText,
      defaultNotes: design.defaultNotes,
    },

    pageFooterNote: `${invoice.invoiceNumber}`,
  };
}
