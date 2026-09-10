# Troubleshooting

**"An invoice never appeared after I placed a test order."**
Check that `npm run worker` is actually running — the web process only enqueues jobs, it never generates a PDF itself. Then check the worker's logs for `invoice.generate.pdf_failed` or a Shopify API error.

**"PDF generation fails with `browserType.launch: Executable doesn't exist`."**
Run `npx playwright install chromium`. This downloads a browser binary separately from the npm package and isn't installed automatically.

**"Emails aren't sending, but invoices generate fine."**
Almost always one of: (1) Settings → Email → "Enable automatic invoice emails" is off, (2) delivery mode is set to Disabled, (3) no `RESEND_API_KEY` (or `SMTP_HOST`) configured, or (4) the order had no email — check the invoice detail page for a banner explaining exactly which one.

**"I'm not receiving the test email I sent from Settings."**
Check spam, and confirm `RESEND_API_KEY`/`EMAIL_FROM` are set — Resend (like most providers) will reject sends from an unverified sending domain. See Resend's own domain verification docs; this app doesn't and can't verify a domain for you (spec §118).

**"Two invoice numbers came out the same" / "numbers look wrong after I changed the prefix."**
Changing the prefix/format/reset policy in Settings only affects invoices generated *after* the change — existing invoice numbers are never rewritten. If you see an actual duplicate, that's a bug — the numbering allocation is a single atomic SQL statement (see `docs/architecture.md` §Invoice numbering); please open an issue with the two invoice IDs.

**"`prisma migrate dev` asks to reset my database."**
That means your local schema has drifted from the migration history — normal after pulling changes that touched `prisma/schema.prisma`. Safe to accept in development (it re-seeds if you also run `npm run seed`). Never run `migrate dev` against production; use `prisma migrate deploy`.

**"Webhook shows as received in Shopify's Partner Dashboard but nothing happened."**
Check the `WebhookEvent` table (`npx prisma studio`) for that `shopifyWebhookId` — if `status = FAILED`, the `errorMessage` column has the reason (most commonly: Redis unreachable, so the job couldn't be enqueued).

**"The invoice PDF preview iframe shows a 403."**
The signed URL/token expired (15 minutes by default — `StoreSettings.signedUrlTtlSeconds`) or the local dev storage file was deleted. Reload the invoice detail page to mint a fresh signed URL.
