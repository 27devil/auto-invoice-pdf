import { ORDER_QUERY, SHOP_QUERY } from "./queries";
import { runGraphql, type AdminGraphqlClient } from "./client";
import type { NormalizedOrder, NormalizedShop, NormalizedAddress, NormalizedLineItem } from "./types";
import { Errors } from "../lib/errors.server";

interface RawAddress {
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  countryCodeV2: string | null;
  phone: string | null;
}

interface RawMoney {
  amount: string;
  currencyCode: string;
}

interface RawMetafieldEdge {
  node: { namespace: string; key: string; value: string };
}

interface RawTaxLine {
  title: string;
  rate: number | null;
  priceSet: { shopMoney: RawMoney };
}

interface RawLineItemNode {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  image: { url: string } | null;
  discountedUnitPriceSet: { shopMoney: RawMoney };
  totalDiscountSet: { shopMoney: RawMoney };
  taxLines: RawTaxLine[] | null;
  variant: { id: string; sku: string | null; image: { url: string } | null } | null;
}

interface RawShippingLineNode {
  title: string;
  originalPriceSet: { shopMoney: RawMoney };
  discountedPriceSet: { shopMoney: RawMoney } | null;
}

interface RawOrder {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  currencyCode: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  taxesIncluded: boolean;
  note: string | null;
  poNumber: string | null;
  email: string | null;
  phone: string | null;
  customer: {
    id: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    metafields?: { edges: RawMetafieldEdge[] };
  } | null;
  billingAddress: RawAddress | null;
  shippingAddress: RawAddress | null;
  metafields?: { edges: RawMetafieldEdge[] };
  subtotalPriceSet: { shopMoney: RawMoney };
  totalDiscountsSet: { shopMoney: RawMoney };
  totalShippingPriceSet: { shopMoney: RawMoney };
  totalTaxSet: { shopMoney: RawMoney };
  totalPriceSet: { shopMoney: RawMoney };
  totalReceivedSet: { shopMoney: RawMoney };
  totalOutstandingSet: { shopMoney: RawMoney };
  taxLines: RawTaxLine[] | null;
  lineItems: { edges: Array<{ node: RawLineItemNode }> } | null;
  shippingLines: { edges: Array<{ node: RawShippingLineNode }> } | null;
}

interface RawShop {
  id: string;
  name: string;
  email: string | null;
  currencyCode: string;
  ianaTimezone: string;
  billingAddress: { country: string | null } | null;
  myshopifyDomain: string;
}

function normalizeAddress(raw: RawAddress | null): NormalizedAddress | null {
  if (!raw) return null;
  return {
    name: raw.name,
    company: raw.company,
    address1: raw.address1,
    address2: raw.address2,
    city: raw.city,
    province: raw.province,
    provinceCode: raw.provinceCode,
    zip: raw.zip,
    country: raw.country,
    countryCode: raw.countryCodeV2,
    phone: raw.phone,
  };
}

function metafieldsToRecord(
  edges: Array<{ node: { namespace: string; key: string; value: string } }> | undefined,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const edge of edges ?? []) {
    record[`${edge.node.namespace}.${edge.node.key}`] = edge.node.value;
  }
  return record;
}

/**
 * Fetches a single order and normalizes it into the shape the invoice engine
 * consumes. Centralizing this means no other module writes a raw order
 * GraphQL query (spec §60).
 */
export async function getOrderForInvoice(
  admin: AdminGraphqlClient,
  orderGid: string,
  options: { orderMetafieldNamespace?: string | null; customerMetafieldNamespace?: string | null } = {},
): Promise<NormalizedOrder> {
  const data = await runGraphql<{ order: RawOrder | null }>(admin, ORDER_QUERY, {
    id: orderGid,
    orderMetafieldNamespace: options.orderMetafieldNamespace ?? undefined,
    customerMetafieldNamespace: options.customerMetafieldNamespace ?? undefined,
  });

  const order = data.order;
  if (!order) {
    throw Errors.orderNotFound(orderGid);
  }

  const lineItems = (order.lineItems?.edges ?? []).map(({ node }) => {
    return {
      shopifyLineItemId: node.id,
      title: node.title,
      variantTitle: node.variantTitle ?? null,
      sku: node.sku ?? node.variant?.sku ?? null,
      quantity: node.quantity,
      unitPrice: node.discountedUnitPriceSet.shopMoney,
      discountAmount: node.totalDiscountSet.shopMoney,
      taxAmount: (node.taxLines ?? []).reduce(
        (sumAmount: number, t: RawTaxLine) => sumAmount + Number(t.priceSet.shopMoney.amount),
        0,
      ),
      imageUrl: node.image?.url ?? node.variant?.image?.url ?? null,
    };
  });

  // taxAmount above was reduced to a plain number for convenience; convert
  // back into a Money-shaped object using the order currency.
  const normalizedLineItems: NormalizedLineItem[] = lineItems.map((li) => ({
    ...li,
    taxAmount: { amount: String(li.taxAmount), currencyCode: order.currencyCode },
  }));

  const shippingLines = (order.shippingLines?.edges ?? []).map((edge) => ({
    title: edge.node.title,
    price: edge.node.discountedPriceSet?.shopMoney ?? edge.node.originalPriceSet.shopMoney,
  }));

  const normalized: NormalizedOrder = {
    id: order.id,
    legacyResourceId: order.legacyResourceId,
    name: order.name,
    // Order.name is the display value ("#1001"); GraphQL has no separate
    // integer order-number field, so we parse it and fall back to 0 rather
    // than throw if a shop customizes the order name format.
    orderNumber: Number(String(order.name).replace(/[^0-9]/g, "")) || 0,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt,
    currencyCode: order.currencyCode,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    taxesIncluded: order.taxesIncluded,
    note: order.note,
    poNumber: order.poNumber ?? null,
    orderEmail: order.email ?? null,
    orderPhone: order.phone ?? null,
    customer: order.customer
      ? {
          id: order.customer.id,
          displayName: order.customer.displayName,
          email: order.customer.email,
          phone: order.customer.phone,
          metafields: metafieldsToRecord(order.customer.metafields?.edges),
        }
      : null,
    billingAddress: normalizeAddress(order.billingAddress),
    shippingAddress: normalizeAddress(order.shippingAddress),
    orderMetafields: metafieldsToRecord(order.metafields?.edges),
    subtotal: order.subtotalPriceSet.shopMoney,
    discountTotal: order.totalDiscountsSet.shopMoney,
    shippingTotal: order.totalShippingPriceSet.shopMoney,
    taxTotal: order.totalTaxSet.shopMoney,
    total: order.totalPriceSet.shopMoney,
    totalReceived: order.totalReceivedSet.shopMoney,
    totalOutstanding: order.totalOutstandingSet.shopMoney,
    taxLines: (order.taxLines ?? []).map((t: RawTaxLine) => ({
      title: t.title,
      rate: t.rate,
      amount: t.priceSet.shopMoney,
    })),
    lineItems: normalizedLineItems,
    shippingLines,
  };

  return normalized;
}

export async function getShop(admin: AdminGraphqlClient): Promise<NormalizedShop> {
  const data = await runGraphql<{ shop: RawShop }>(admin, SHOP_QUERY);
  const shop = data.shop;
  return {
    id: shop.id,
    name: shop.name,
    email: shop.email,
    currencyCode: shop.currencyCode,
    ianaTimezone: shop.ianaTimezone,
    country: shop.billingAddress?.country ?? null,
    myshopifyDomain: shop.myshopifyDomain,
  };
}
