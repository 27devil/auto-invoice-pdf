# Webhooks

## Signature verification

Every webhook route calls `authenticate.webhook(request)` from `@shopify/shopify-app-react-router` — Shopify's own official HMAC verification. Nothing in this app hand-rolls signature checking (spec §92).

## Idempotency (spec §34)

`server/webhooks/idempotency.server.ts`'s `recordWebhookEvent()` inserts a `WebhookEvent` row keyed by the `X-Shopify-Webhook-Id` header, which has a `UNIQUE` database constraint. Two concurrent deliveries of the same webhook both attempt the insert; exactly one succeeds, the other gets a Postgres `P2002` violation and is treated as a duplicate — no processing, no re-enqueue, no second invoice, no second email. This is race-safe in a way a "check then insert" pattern wouldn't be. See `tests/unit/webhookIdempotency.test.ts`.

## Order-level idempotency (spec §35)

Separately, `server/invoices/invoiceService.ts`'s `findExistingInvoice()` checks the `(shopId, shopifyOrderId)` unique constraint on `Invoice` before creating one — belt-and-suspenders in case a job ever gets re-run outside the webhook path (e.g. manual retry).

## Response time (spec §9, §58)

The webhook route does the minimum possible before responding: validate → upsert shop → record the event → enqueue a job → return. Order fetching, PDF rendering, and email sending all happen in the worker process, never inline in the request.

## GDPR compliance webhooks (spec §33, §96)

`webhooks.customers.data_request.tsx`, `webhooks.customers.redact.tsx`, and `webhooks.shop.redact.tsx` are implemented and tested manually, but their subscriptions in `shopify.app.toml` are commented out — they're only *mandatory* for a publicly-distributed (App Store) app, and this app is currently configured as a single-merchant custom app (see `docs/shopify-setup.md`). Uncomment them before ever changing distribution.

- **`customers/data_request`** — logs an audit entry today; extend it with a real export if you build customer-facing data access.
- **`customers/redact`** — anonymizes PII (name, email, phone, addresses) on matching invoices, but deliberately preserves financial figures (totals, line items, invoice number) as accounting records.
- **`shop/redact`** — deletes the `Shop` row; every child table cascades via `onDelete: Cascade` in `prisma/schema.prisma`, so no manual fan-out is needed.

## Uninstall cleanup (spec §95)

`webhooks.app.uninstalled.tsx` deletes the shop's sessions (revoking API access immediately) and marks `Shop.uninstalledAt`. Invoice/audit history is retained per `StoreSettings.dataRetentionDays` rather than deleted outright — a merchant reinstalling later doesn't lose their invoice history.
