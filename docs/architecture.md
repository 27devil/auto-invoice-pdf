# Architecture

## Request/data flow

```
Customer places order
  → Shopify creates the order
  → ORDERS_CREATE webhook fires
  → app/routes/webhooks.orders.create.tsx
      - authenticate.webhook() validates the HMAC signature (Shopify's own library, not hand-rolled)
      - upserts the Shop row + default settings if this is the very first event for this shop
      - server/webhooks/idempotency.server.ts inserts a WebhookEvent row;
        a UNIQUE constraint on shopifyWebhookId makes a redelivered webhook
        a guaranteed no-op, race-safe under concurrent delivery
      - enqueues a "generate-invoice" BullMQ job and returns immediately
        (no order fetch, PDF render, or email send happens inline — the
        webhook response must be fast)
  → server/queue/worker.ts (separate process) picks up the job
      - server/queue/handlers/generateInvoice.server.ts:
          1. loads/initializes shop settings
          2. fetches the full order via the centralized GraphQL service
             (server/shopify/orderService.ts)
          3. server/invoices/invoiceService.ts creates the Invoice +
             InvoiceItem rows — idempotent on (shopId, shopifyOrderId), and
             allocates the invoice number atomically
             (server/invoices/numbering.server.ts)
          4. server/pdf/pdfService.ts renders the invoice to a PDF via a
             real headless browser (Playwright), which is what makes long
             invoices paginate correctly instead of clipping
          5. server/storage/*.server.ts uploads the PDF (local disk in dev,
             S3-compatible object storage in production)
          6. if auto-email is enabled, enqueues a "send-invoice-email" job
      - server/queue/handlers/sendInvoiceEmail.server.ts:
          - server/email/InvoiceEmailService.ts resolves the recipient,
            de-duplicates automatic sends, renders the merchant's editable
            template, and calls the configured EmailProvider with the PDF
            as an attachment
```

## Multi-tenant isolation

Every table that holds store-specific data carries a `shopId` foreign key (see `prisma/schema.prisma`). Every query in `app/routes/*` that reads or writes an Invoice scopes it by `shopId` derived from the authenticated session — never by a bare `id` from the URL. `app/routes/app.invoices.$id.tsx` and the `/api/invoices/:id/*` routes all do `findFirstOrThrow({ where: { id, shopId } })`, so requesting another shop's invoice ID 404s instead of leaking data.

## Money

Every monetary value is a Postgres `Decimal(18,4)` column, read/written through `decimal.js` (`server/lib/money.server.ts`) — never a JS `number`. When our locally-summed line items disagree with Shopify's own order total by more than a cent of rounding noise, we log the discrepancy and use Shopify's number (`reconcile()` in `money.server.ts`) rather than silently diverging from what Shopify itself considers the order to be worth.

## Invoice numbering

`server/invoices/numbering.server.ts` allocates numbers with a single atomic SQL statement:

```sql
INSERT INTO "InvoiceNumberSequence" (id, "shopId", "periodKey", "nextValue", "updatedAt")
VALUES ($1, $2, $3, $4 + 1, now())
ON CONFLICT ("shopId", "periodKey")
DO UPDATE SET "nextValue" = "InvoiceNumberSequence"."nextValue" + 1, "updatedAt" = now()
RETURNING "nextValue" - 1 AS allocated
```

This is a single Postgres statement, so it's atomic regardless of whether the (shopId, periodKey) row already exists — there's no read-then-write race window for two concurrent orders to land on. `periodKey` is `"ALL"` for a continuous sequence, the calendar year for a yearly reset, or `"YYYY-MM"` for a monthly reset, computed in the shop's own timezone (not the server's).

## What's deliberately not built yet (Roadmap)

These are structured for, but not implemented, per the "MVP first, check in" plan:

- **Credit notes** — the `CreditNote` Prisma model and the `send-credit-note` queue job exist; nothing enqueues that job yet because no `REFUNDS_CREATE` webhook is wired up. Wiring it is a small, contained change (add the webhook subscription + handler, implement `handleSendCreditNote`).
- **Order-detail admin UI extension** — generate/view/resend/download actions directly on Shopify's order page (spec §25/§115) need a Shopify Admin UI extension package under `extensions/`.
- **Bulk actions & multi-select** on the invoices list (spec §83).
- **Full E2E test suite** (Playwright browser tests covering install → configure → order → verify) and deeper integration tests against a live Postgres/Redis in CI.
- **SendGrid / SES email adapters** — interfaces exist (`server/email/providers/stubs.server.ts`) and are selectable via `EMAIL_PROVIDER`, but the HTTP calls themselves aren't implemented (Resend and SMTP are fully wired).
- **Billing** — `Shop.plan`/`subscriptionStatus`/`billingCustomerId`/`billingSubscriptionId` fields exist; no Shopify Billing API integration yet.
- **Accounting integrations** (QuickBooks/Xero/etc.) — explicitly out of scope for V1 per the original spec.

## Data retention

`StoreSettings.dataRetentionDays` exists as a configuration point; no scheduled job currently purges old data against it — see `docs/troubleshooting.md` if you need to build that job next.
