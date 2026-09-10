/** Data contract for the PDF template. Deliberately decoupled from Prisma
 * model shapes and from Shopify's API shapes — the PDF service is fully
 * independent of both (spec §61). */

export interface InvoicePdfAddress {
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
}

export interface InvoicePdfLineItem {
  sku: string | null;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface InvoicePdfDesign {
  accentColor: string;
  fontFamily: string;
  showSku: boolean;
  showProductImage: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showShipping: boolean;
  showCustomerPhone: boolean;
  showCompanyOnBill: boolean;
  showPaymentInfo: boolean;
  showBankInfo: boolean;
  showNotes: boolean;
  footerText: string;
  termsText: string;
  defaultNotes: string;
}

export interface InvoicePdfCompany {
  companyName: string;
  legalBusinessName: string | null;
  logoDataUrl: string | null; // pre-resolved data: URL, PDF service never fetches network resources
  addressLines: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  taxIdLabel: string | null; // e.g. "GSTIN" — formatted with TaxSettings
  taxId: string | null;
  registrationNumber: string | null;
  bankDetails: string | null;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  orderName: string;
  invoiceDateLabel: string;
  dueDateLabel: string | null;
  paymentStatusLabel: string;
  currency: string;

  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  companyName: string | null;
  customerTaxId: string | null;
  poNumber: string | null;
  billingAddress: InvoicePdfAddress | null;
  shippingAddress: InvoicePdfAddress | null;

  items: InvoicePdfLineItem[];

  subtotal: string;
  discountTotal: string;
  shippingTotal: string;
  taxTotal: string;
  taxLabel: string;
  total: string;
  amountPaid: string;
  balanceDue: string;

  company: InvoicePdfCompany;
  design: InvoicePdfDesign;

  pageFooterNote: string; // shown in the printed page footer, e.g. "Invoice INV-2026-000001 · Page X of Y" is handled by Playwright footerTemplate
}
