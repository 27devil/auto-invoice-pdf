# Shopify setup

## Scopes

Configured in `shopify.app.toml`:

| Scope | Why |
| --- | --- |
| `read_orders` | Fetch order, line item, tax, discount, and shipping data to build the invoice. |
| `read_customers` | Resolve the customer's name/email/phone and billing context, and read customer metafields for GSTIN/PO-number/company-name mapping. |
| `read_products` | Resolve a variant's image when it isn't already present on the order line item, when "show product image" is enabled. |

No `write_` scopes are requested — this app never mutates store data. If you extend it (e.g. writing a metafield back to the order), add the specific scope and document it here.

## Webhooks

Declared in `shopify.app.toml` under `[[webhooks.subscriptions]]` (the current declarative pattern — no imperative `registerWebhooks()` call is needed; the CLI syncs these on `shopify app deploy`/`dev`):

- `orders/create` → `app/routes/webhooks.orders.create.tsx` — the core trigger.
- `orders/updated` → `app/routes/webhooks.orders.updated.tsx` — recorded for idempotency/audit today; doesn't mutate an existing invoice.
- `orders/cancelled` → `app/routes/webhooks.orders.cancelled.tsx` — marks a matching invoice `CANCELLED` without touching its PDF/number.
- `app/uninstalled` → `app/routes/webhooks.app.uninstalled.tsx` — revokes sessions, marks the shop uninstalled.
- `app/scopes_update` → `app/routes/webhooks.app.scopes_update.tsx` (template default, unchanged).

## Distribution

`app/shopify.server.ts` is currently configured with `AppDistribution.SingleMerchant` — a custom app built for one specific merchant (Spill Ready Supplies), installed directly without an App Store listing or review.

If you ever want to publish this on the Shopify App Store:

1. Change `distribution: AppDistribution.SingleMerchant` to `AppDistribution.AppStore` in `app/shopify.server.ts`.
2. Uncomment the three mandatory GDPR compliance webhook subscriptions at the bottom of `shopify.app.toml` (`customers/data_request`, `customers/redact`, `shop/redact`). Their handlers already exist and are tested — see `docs/webhooks.md`.
3. Add privacy policy / terms / support / contact routes/URLs (spec §96) — not built yet, since they only matter for public distribution.
4. Review Shopify's current App Store listing requirements at https://shopify.dev/docs/apps/launch — these change over time, so check the current documentation rather than relying on this file.

## GraphQL API version

Pinned to `2025-10` (`ApiVersion.October25` in `app/shopify.server.ts`, matching `[webhooks].api_version` in `shopify.app.toml`). Bump both together when you upgrade.
