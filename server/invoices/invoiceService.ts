import type { PrismaClient, Invoice, StoreSettings, TaxSettings, InvoicePaymentStatus, Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import type { NormalizedOrder } from "../shopify/types";
import { toDecimal, toPrismaDecimalInput, sum, reconcile } from "../lib/money.server";
import { generateInvoiceNumber } from "./numbering.server";
import { logger } from "../lib/logger.server";
import { recordAuditLog } from "../lib/audit.server";

const FINANCIAL_STATUS_MAP: Record<string, InvoicePaymentStatus> = {
  PENDING: "PENDING",
  AUTHORIZED: "AUTHORIZED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  VOIDED: "VOIDED",
  EXPIRED: "PENDING",
};

/** spec §65: order email takes priority, then customer email. Never guess. */
export function resolveCustomerEmail(order: NormalizedOrder): string | null {
  return order.orderEmail || order.customer?.email || null;
}

export function resolveCustomerPhone(order: NormalizedOrder): string | null {
  return order.orderPhone || order.customer?.phone || order.billingAddress?.phone || null;
}

/** Looks up a mapped Shopify metafield ("namespace.key") on the order or customer. */
function resolveMetafield(
  order: NormalizedOrder,
  mapping: string | null | undefined,
  source: "order" | "customer",
): string | null {
  if (!mapping) return null;
  const record = source === "order" ? order.orderMetafields : order.customer?.metafields;
  return record?.[mapping] ?? null;
}

export interface InvoiceCreationInputs {
  shopId: string;
  shopTimezone: string;
  order: NormalizedOrder;
  numberingSettings: Pick<
    StoreSettings,
    "invoiceNumberPrefix" | "invoiceNumberFormat" | "invoiceNumberPadding" | "invoiceNumberStart" | "invoiceNumberReset" | "dueDateDaysOut"
  >;
  taxSettings: Pick<TaxSettings, "gstinMetafield" | "poNumberMetafield" | "companyNameMetafield">;
}

/**
 * Order-level idempotency (spec §35): before creating an invoice, check
 * shopId + shopifyOrderId. Callers should treat a non-null return as "already
 * handled" and skip straight to checking pdf/email status for a retry.
 */
export async function findExistingInvoice(prisma: PrismaClient, shopId: string, shopifyOrderId: string): Promise<Invoice | null> {
  return prisma.invoice.findUnique({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
  });
}

/**
 * Creates the Invoice + InvoiceItem rows for a normalized order. Does not
 * touch PDF generation or email — those are separate queue stages so a
 * webhook retry never risks a duplicate invoice number (see
 * server/queue/handlers/generateInvoice.ts).
 */
export async function createInvoiceFromOrder(prisma: PrismaClient, inputs: InvoiceCreationInputs): Promise<Invoice> {
  const { shopId, shopTimezone, order, numberingSettings, taxSettings } = inputs;

  const existing = await findExistingInvoice(prisma, shopId, order.legacyResourceId);
  if (existing) {
    logger.info("invoice.create.idempotent_skip", { shopId, shopifyOrderId: order.legacyResourceId, invoiceId: existing.id });
    return existing;
  }

  const subtotal = toDecimal(order.subtotal);
  const discountTotal = toDecimal(order.discountTotal);
  const shippingTotal = toDecimal(order.shippingTotal);
  const taxTotal = toDecimal(order.taxTotal);
  const authoritativeTotal = toDecimal(order.total);

  const locallyComputed = subtotal.minus(discountTotal).plus(shippingTotal).plus(taxTotal);
  const { value: total, reconciled, diff } = reconcile(locallyComputed, authoritativeTotal);
  if (!reconciled) {
    // spec §88: prefer Shopify's authoritative totals; log the discrepancy rather than diverge silently.
    logger.warn("invoice.totals.reconciliation_mismatch", {
      shopId,
      shopifyOrderId: order.legacyResourceId,
      locallyComputed: locallyComputed.toFixed(4),
      authoritative: authoritativeTotal.toFixed(4),
      diff: diff.toFixed(4),
    });
  }

  const amountPaid = toDecimal(order.totalReceived);
  const balanceDue = toDecimal(order.totalOutstanding);

  const invoiceNumber = await generateInvoiceNumber(
    prisma,
    shopId,
    {
      prefix: numberingSettings.invoiceNumberPrefix,
      format: numberingSettings.invoiceNumberFormat,
      padding: numberingSettings.invoiceNumberPadding,
      startValue: numberingSettings.invoiceNumberStart,
      resetPolicy: numberingSettings.invoiceNumberReset,
    },
    shopTimezone,
  );

  const email = resolveCustomerEmail(order);
  const phone = resolveCustomerPhone(order);
  const customerTaxId = resolveMetafield(order, taxSettings.gstinMetafield, "order") ?? resolveMetafield(order, taxSettings.gstinMetafield, "customer");
  const poNumber = order.poNumber ?? resolveMetafield(order, taxSettings.poNumberMetafield, "order");
  const companyName =
    order.billingAddress?.company ??
    resolveMetafield(order, taxSettings.companyNameMetafield, "order") ??
    resolveMetafield(order, taxSettings.companyNameMetafield, "customer");

  const invoiceDate = new Date();
  const dueDate = numberingSettings.dueDateDaysOut
    ? new Date(invoiceDate.getTime() + numberingSettings.dueDateDaysOut * 24 * 60 * 60 * 1000)
    : invoiceDate;

  const items = order.lineItems.map((li, index) => {
    const unitPrice = toDecimal(li.unitPrice);
    const discountAmount = toDecimal(li.discountAmount);
    const taxAmount = toDecimal(li.taxAmount);
    const lineTotal = unitPrice.times(li.quantity).minus(discountAmount).plus(taxAmount);
    return {
      shopifyLineItemId: li.shopifyLineItemId,
      sku: li.sku, // null renders as "N/A" on the PDF — never breaks generation (spec §16)
      productTitle: li.title,
      variantTitle: li.variantTitle,
      imageUrl: li.imageUrl,
      quantity: li.quantity,
      unitPrice: toPrismaDecimalInput(unitPrice),
      discountAmount: toPrismaDecimalInput(discountAmount),
      taxAmount: toPrismaDecimalInput(taxAmount),
      lineTotal: toPrismaDecimalInput(lineTotal),
      position: index,
    };
  });

  const invoice = await prisma.invoice.create({
    data: {
      shopId,
      shopifyOrderId: order.legacyResourceId,
      shopifyOrderGid: order.id,
      shopifyOrderNumber: order.orderNumber,
      invoiceNumber,
      invoiceStatus: "GENERATING",
      invoiceDate,
      dueDate,
      currency: order.currencyCode,
      subtotal: toPrismaDecimalInput(subtotal),
      discountTotal: toPrismaDecimalInput(discountTotal),
      shippingTotal: toPrismaDecimalInput(shippingTotal),
      taxTotal: toPrismaDecimalInput(taxTotal),
      total: toPrismaDecimalInput(total),
      amountPaid: toPrismaDecimalInput(amountPaid),
      balanceDue: toPrismaDecimalInput(balanceDue),
      paymentStatus: FINANCIAL_STATUS_MAP[order.financialStatus] ?? "PENDING",
      customerName: order.customer?.displayName || order.billingAddress?.name || order.shippingAddress?.name || "Customer",
      customerEmail: email,
      customerPhone: phone,
      billingAddress: (order.billingAddress ?? undefined) as Prisma.InputJsonValue | undefined,
      shippingAddress: (order.shippingAddress ?? undefined) as Prisma.InputJsonValue | undefined,
      companyName,
      customerTaxId,
      poNumber,
      emailStatus: email ? "NOT_SENT" : "NOT_SENT",
      emailStatusReason: email ? null : "CUSTOMER_EMAIL_MISSING",
      items: { create: items },
    },
  });

  await recordAuditLog(prisma, {
    shopId,
    action: "invoice.created",
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber, shopifyOrderId: order.legacyResourceId },
  });

  return invoice;
}

/** Recomputes just the aggregate items sum, for tests/verification (spec §52 style checks). */
export function sumLineItems(order: NormalizedOrder): Decimal {
  return sum(order.lineItems.map((li) => toDecimal(li.unitPrice).times(li.quantity)));
}
