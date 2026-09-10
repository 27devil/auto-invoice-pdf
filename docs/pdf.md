# PDF engine

## How it works

`server/pdf/template.ts` renders an invoice to an HTML string; `server/pdf/pdfService.ts` loads that HTML into a headless Chromium page (Playwright) and calls `page.pdf()`. Using a real browser — rather than a low-level PDF-primitives library — is what makes a long order's item table automatically flow onto additional A4 pages instead of clipping, overlapping, or requiring manual pagination math. `tr { break-inside: avoid }` and similar CSS rules keep a single row from splitting across a page boundary.

`server/pdf/mapInvoiceToPdfData.ts` converts a Prisma `Invoice` (+ items, company profile, design settings, tax settings) into the `InvoicePdfData` contract the template consumes. The PDF layer itself (`template.ts`, `pdfService.ts`) has zero imports from Prisma or the Shopify SDK — it only knows about that contract, so it's independently testable (see `tests/unit/pdfMapping.test.ts`) and could be reused for a completely different data source later.

## Customization

Settings → Invoice template controls: accent color, font (from a small safe list — no external font loading, so PDF rendering stays deterministic and offline), and show/hide toggles for SKU, product image, discount, tax, shipping, customer phone, company name, payment info, bank details, and notes. Footer text, terms & conditions, and default notes are free text.

## Versioning

Regenerating a PDF (Settings action or `/api/invoices/:id/regenerate`) never changes the invoice number — only `Invoice.pdfVersion` increments, and the new PDF is stored at a version-suffixed storage key (`invoices/<shop>/<invoiceNumber>/v<version>.pdf`). Older versions are never deleted automatically.

## Tax fields

India-specific fields (GSTIN, HSN/SAC, CGST/SGST/IGST) are **not** assumed for every order. `TaxSettings.showIndiaGstFields` must be explicitly turned on, and even then the GSTIN line only appears when a value is actually present (company GSTIN from Settings, or a mapped customer/order metafield) — never a blank placeholder.

## SKU handling

A missing SKU renders as `N/A` (`server/pdf/template.ts`) rather than blank or breaking generation — see spec §16 and the corresponding test in `tests/unit/pdfMapping.test.ts`.

## Testing PDF generation locally

```bash
npx playwright install chromium   # one-time, downloads the browser binary
npm test                          # unit tests cover the HTML template directly (fast, no browser needed)
```

The unit tests exercise `renderInvoiceHtml()` directly (string assertions on the HTML) rather than launching a browser, so they run fast and don't need Chromium installed. Actually rendering to PDF bytes only happens in the worker process at runtime.
