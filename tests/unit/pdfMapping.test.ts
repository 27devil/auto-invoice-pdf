import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import type { CompanyProfile, InvoiceDesignSettings, TaxSettings, Invoice, InvoiceItem } from "@prisma/client";
import { mapInvoiceToPdfData } from "../../server/pdf/mapInvoiceToPdfData";
import { renderInvoiceHtml } from "../../server/pdf/template";

// These fixtures deliberately don't import Prisma to build their values —
// they're hand-written literals shaped like the generated models. The
// `Decimal` here is decimal.js directly rather than `Prisma.Decimal`
// (Prisma vendors its own copy of the same library), so a single cast to
// the real model type happens once, in the builder, rather than an
// `as any` sprinkled across every test that calls mapInvoiceToPdfData.
function baseCompany(): CompanyProfile {
  return {
    id: "cp_1",
    shopId: "shop_1",
    companyName: "Spill Ready Supplies",
    legalBusinessName: null,
    logoStorageKey: null,
    addressLine1: "123 Main St",
    addressLine2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
    phone: "555-1234",
    email: "hello@spillready.example",
    website: "https://spillready.example",
    taxId: null,
    registrationNumber: null,
    bankDetails: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function baseDesign(): InvoiceDesignSettings {
  return {
    id: "d_1",
    shopId: "shop_1",
    accentColor: "#1A1A1A",
    fontFamily: "Helvetica",
    showSku: true,
    showProductImage: false,
    showDiscount: true,
    showTax: true,
    showShipping: true,
    showCustomerPhone: false,
    showCompanyOnBill: true,
    showPaymentInfo: true,
    showBankInfo: false,
    showNotes: true,
    footerText: "Thank you for your business.",
    termsText: "",
    defaultNotes: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as InvoiceDesignSettings;
}

function baseTax(): TaxSettings {
  return {
    id: "t_1",
    shopId: "shop_1",
    taxDisplay: "TAX_EXCLUSIVE",
    defaultTaxLabel: "Tax",
    showIndiaGstFields: false,
    companyGstin: null,
    gstinMetafield: null,
    poNumberMetafield: null,
    companyNameMetafield: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as TaxSettings;
}

function baseInvoice(overrides: Record<string, unknown> = {}): Invoice & { items: InvoiceItem[] } {
  return {
    id: "inv_1",
    shopId: "shop_1",
    shopifyOrderId: "5000000001",
    shopifyOrderGid: "gid://shopify/Order/5000000001",
    shopifyOrderNumber: 1001,
    invoiceNumber: "INV-2026-000001",
    invoiceStatus: "GENERATED",
    invoiceDate: new Date("2026-09-10T00:00:00Z"),
    dueDate: new Date("2026-09-10T00:00:00Z"),
    pdfVersion: 1,
    currency: "USD",
    subtotal: new Decimal("100.00"),
    discountTotal: new Decimal("0.00"),
    shippingTotal: new Decimal("10.00"),
    taxTotal: new Decimal("8.50"),
    total: new Decimal("118.50"),
    amountPaid: new Decimal("118.50"),
    balanceDue: new Decimal("0.00"),
    paymentStatus: "PAID",
    customerName: "Jordan Sample",
    customerEmail: "jordan@example.com",
    customerPhone: null,
    billingAddress: { name: "Jordan Sample", company: null, address1: "1 Test St", address2: null, city: "Austin", province: "TX", zip: "78701", country: "US", phone: null },
    shippingAddress: null,
    companyName: null,
    customerTaxId: null,
    poNumber: null,
    pdfStorageKey: null,
    pdfChecksum: null,
    emailStatus: "NOT_SENT",
    emailStatusReason: null,
    emailSentAt: null,
    cancelledAt: null,
    currentJobId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: "item_1",
        invoiceId: "inv_1",
        shopifyLineItemId: "gid://shopify/LineItem/1",
        sku: "SRS-UPAD-100",
        productTitle: "Universal Absorbent Pad",
        variantTitle: "Medium",
        imageUrl: null,
        quantity: 2,
        unitPrice: new Decimal("50.00"),
        discountAmount: new Decimal("0.00"),
        taxAmount: new Decimal("8.50"),
        lineTotal: new Decimal("108.50"),
        position: 0,
      },
    ],
    ...overrides,
  } as unknown as Invoice & { items: InvoiceItem[] };
}

describe("mapInvoiceToPdfData", () => {
  it("maps a normal invoice into PDF-ready strings", () => {
    const data = mapInvoiceToPdfData({
      invoice: baseInvoice(),
      company: baseCompany(),
      design: baseDesign(),
      tax: baseTax(),
      logoDataUrl: null,
      dateFormat: "dd MMM yyyy",
    });

    expect(data.invoiceNumber).toBe("INV-2026-000001");
    expect(data.orderName).toBe("#1001");
    expect(data.total).toBe("USD 118.50");
    expect(data.items).toHaveLength(1);
    expect(data.items[0].unitPrice).toBe("USD 50.00");
  });

  it("passes a missing SKU through as null rather than throwing", () => {
    const invoice = baseInvoice();
    (invoice.items[0] as { sku: string | null }).sku = null;

    const data = mapInvoiceToPdfData({
      invoice,
      company: baseCompany(),
      design: baseDesign(),
      tax: baseTax(),
      logoDataUrl: null,
      dateFormat: "dd MMM yyyy",
    });

    expect(data.items[0].sku).toBeNull();
  });
});

describe("renderInvoiceHtml", () => {
  function render(overrides: Record<string, unknown> = {}) {
    const invoice = baseInvoice(overrides.invoiceOverrides ? (overrides.invoiceOverrides as Record<string, unknown>) : {});
    return renderInvoiceHtml(
      mapInvoiceToPdfData({
        invoice,
        company: baseCompany(),
        design: baseDesign(),
        tax: baseTax(),
        logoDataUrl: null,
        dateFormat: "dd MMM yyyy",
      }),
    );
  }

  it("renders N/A for a missing SKU instead of breaking generation (spec §16)", () => {
    const invoice = baseInvoice();
    (invoice.items[0] as { sku: string | null }).sku = null;
    const html = renderInvoiceHtml(
      mapInvoiceToPdfData({ invoice, company: baseCompany(), design: baseDesign(), tax: baseTax(), logoDataUrl: null, dateFormat: "dd MMM yyyy" }),
    );
    expect(html).toContain("SKU: N/A");
  });

  it("escapes a customer email containing HTML rather than injecting it", () => {
    const invoice = baseInvoice();
    invoice.customerEmail = '<script>alert(1)</script>@example.com';
    const html = renderInvoiceHtml(
      mapInvoiceToPdfData({ invoice, company: baseCompany(), design: baseDesign(), tax: baseTax(), logoDataUrl: null, dateFormat: "dd MMM yyyy" }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders every line item for a long order without dropping any (spec §52: 100 items)", () => {
    const invoice = baseInvoice();
    invoice.items = Array.from({ length: 100 }, (_, i) => ({
      ...invoice.items[0],
      id: `item_${i}`,
      sku: `SKU-${i}`,
      productTitle: `Product ${i}`,
      position: i,
    }));
    const html = renderInvoiceHtml(
      mapInvoiceToPdfData({ invoice, company: baseCompany(), design: baseDesign(), tax: baseTax(), logoDataUrl: null, dateFormat: "dd MMM yyyy" }),
    );
    for (let i = 0; i < 100; i += 25) {
      expect(html).toContain(`Product ${i}`);
    }
    expect(html.match(/class="product-title"/g)?.length).toBe(100);
  });

  it("handles a very long product name without throwing", () => {
    const invoice = baseInvoice();
    invoice.items[0].productTitle = "A".repeat(500);
    expect(() => render({ invoiceOverrides: invoice })).not.toThrow();
  });
});
