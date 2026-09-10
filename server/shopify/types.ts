/** Normalized shapes the rest of the app consumes — never raw GraphQL JSON. */

export interface Money {
  amount: string; // Shopify returns money as decimal strings; parse with Decimal, never Number
  currencyCode: string;
}

export interface NormalizedAddress {
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
}

export interface NormalizedTaxLine {
  title: string;
  rate: number | null;
  amount: Money;
}

export interface NormalizedLineItem {
  shopifyLineItemId: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: Money;
  discountAmount: Money;
  taxAmount: Money;
  imageUrl: string | null;
}

export interface NormalizedShippingLine {
  title: string;
  price: Money;
}

export interface NormalizedOrder {
  id: string; // GID
  legacyResourceId: string; // numeric id as string
  name: string; // "#1001"
  orderNumber: number;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  currencyCode: string;
  financialStatus: string;
  fulfillmentStatus: string;
  taxesIncluded: boolean;
  note: string | null;
  poNumber: string | null;
  /** Checkout contact email/phone — spec §65: prefer this over customer.email, never guess. */
  orderEmail: string | null;
  orderPhone: string | null;
  customer: {
    id: string | null;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    metafields: Record<string, string>;
  } | null;
  billingAddress: NormalizedAddress | null;
  shippingAddress: NormalizedAddress | null;
  orderMetafields: Record<string, string>;
  subtotal: Money;
  discountTotal: Money;
  shippingTotal: Money;
  taxTotal: Money;
  total: Money;
  totalReceived: Money;
  totalOutstanding: Money;
  taxLines: NormalizedTaxLine[];
  lineItems: NormalizedLineItem[];
  shippingLines: NormalizedShippingLine[];
}

export interface NormalizedShop {
  id: string;
  name: string;
  email: string | null;
  currencyCode: string;
  ianaTimezone: string;
  country: string | null;
  myshopifyDomain: string;
}
