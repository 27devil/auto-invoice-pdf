# Email

## Delivery modes (spec §2, §55)

Shopify's native order-confirmation email and this app's invoice email are **separate delivery systems** — Shopify's API doesn't support attaching an arbitrary, dynamically-generated PDF to its own native notification. Settings → Email → "Invoice delivery mode" controls what actually happens:

| Mode | Behavior |
| --- | --- |
| **Native + invoice email** (default) | Shopify sends its own native confirmation as usual; this app separately emails the invoice PDF. The customer receives two emails. |
| **App confirmation with invoice** | Use this only if you want this app's email to function as the customer's confirmation-style email. Consider turning off Shopify's native notification (Shopify admin → Settings → Notifications) to avoid sending two. |
| **Invoice email only** | Same email as the default mode, for a merchant who has already disabled Shopify's native confirmation themselves. |
| **Disabled** | Invoices still generate; nothing is ever emailed. Download manually from the Invoices list. |

The Settings UI shows this exact explanation inline so a merchant can't miss it.

## Templates

Settings → Email lets the merchant edit the subject, greeting, body, and footer as plain text with `{{variable}}` tokens (`server/email/template.ts`). Supported variables: `customer_name`, `order_number`, `invoice_number`, `invoice_date`, `total`, `currency`, `company_name`, `support_email`, `shop_url`. An unrecognized token is left as-is rather than silently dropped, so a typo is visible instead of invisible.

## Duplicate-send protection (spec §56)

Before an **automatic** send, `InvoiceEmailService.sendInvoice()` checks for an existing `EmailDelivery` row for that invoice with `trigger = AUTOMATIC` and a status of `QUEUED`/`SENDING`/`SENT`/`DELIVERED` — if one exists, it's a no-op. A **manual resend** (from the invoice detail page or `/api/invoices/:id/resend`) always creates a new `EmailDelivery` row with `trigger = MANUAL_RESEND`, explicitly bypassing that guard.

## Missing customer email (spec §39)

If an order has no usable email (checked in this order: Shopify's checkout-level `order.email`, then `customer.email` — never guessed, never a billing-address fallback that wasn't actually supplied as an email), the invoice still generates. `Invoice.emailStatus` is set to `NOT_SENT` with `emailStatusReason = CUSTOMER_EMAIL_MISSING`, and the invoice detail page shows a banner explaining that it can be downloaded and sent manually.

## Test mode

`EmailSettings.testMode` defaults to **ON** for every new shop. While on, every automatic and manual send is redirected to `EmailSettings.testEmailAddress` (the subject is prefixed `[TEST MODE]`) — real customers never receive anything until a merchant explicitly turns it off. Settings → Email also has a one-off "Send test email" action that always uses the sample data seen in `docs/pdf.md`'s example, regardless of test mode.

## Providers

`server/email/EmailProvider.ts` defines the interface every provider implements. `RESEND` (default, fully implemented) and `SMTP` (via nodemailer, fully implemented) are ready to use. `SENDGRID` and `SES` are selectable in Settings but throw a clear "not implemented" error if actually used — see the header comment in `server/email/providers/stubs.server.ts` for how to fill them in without touching anything else (`InvoiceEmailService`, retry/backoff, delivery logging are all provider-agnostic already).

Provider credentials always come from server-side environment variables (`RESEND_API_KEY`, `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`) — never from a merchant-entered form field, so they can't leak to the browser.
