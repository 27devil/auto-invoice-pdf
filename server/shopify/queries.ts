/**
 * Centralized GraphQL documents. Nothing outside this folder should embed a
 * raw GraphQL string for a Shopify Admin API call — see spec §60.
 *
 * Written against Admin API 2025-10 (see shopify.app.toml [webhooks].api_version
 * and app/shopify.server.ts ApiVersion.October25). Money fields use MoneyBag
 * (`*Set { shopMoney { amount currencyCode } }`) rather than the deprecated
 * plain-string money fields.
 */

export const ORDER_QUERY = /* GraphQL */ `
  query GetOrderForInvoice(
    $id: ID!
    $orderMetafieldNamespace: String
    $customerMetafieldNamespace: String
  ) {
    order(id: $id) {
      id
      name
      legacyResourceId
      createdAt
      updatedAt
      cancelledAt
      currencyCode
      presentmentCurrencyCode
      displayFinancialStatus
      displayFulfillmentStatus
      confirmed
      test
      note
      poNumber
      email
      phone
      customAttributes {
        key
        value
      }
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalDiscountsSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalShippingPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalTaxSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalReceivedSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalOutstandingSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      currentTotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      taxLines {
        title
        rate
        priceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      taxesIncluded
      customer {
        id
        displayName
        firstName
        lastName
        email
        phone
        metafields(first: 10, namespace: $customerMetafieldNamespace) {
          edges {
            node {
              namespace
              key
              value
            }
          }
        }
      }
      billingAddress {
        name
        company
        address1
        address2
        city
        province
        provinceCode
        zip
        country
        countryCodeV2
        phone
      }
      shippingAddress {
        name
        company
        address1
        address2
        city
        province
        provinceCode
        zip
        country
        countryCodeV2
        phone
      }
      metafields(first: 20, namespace: $orderMetafieldNamespace) {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
      lineItems(first: 250) {
        edges {
          node {
            id
            title
            variantTitle
            sku
            quantity
            image {
              url
            }
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalDiscountSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            taxLines {
              title
              rate
              priceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
            variant {
              id
              sku
              image {
                url
              }
            }
          }
        }
      }
      shippingLines(first: 10) {
        edges {
          node {
            title
            originalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

// Namespace-scoped metafield lookups are passed as query variables so a
// single document works regardless of which namespace the merchant mapped
// in Settings → Tax → Metafield mapping (spec §15).
export interface OrderQueryVariables {
  id: string;
  orderMetafieldNamespace?: string | null;
  customerMetafieldNamespace?: string | null;
}

export const SHOP_QUERY = /* GraphQL */ `
  query GetShop {
    shop {
      id
      name
      email
      currencyCode
      ianaTimezone
      billingAddress {
        country
        countryCodeV2
      }
      myshopifyDomain
    }
  }
`;
