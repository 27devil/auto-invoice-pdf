# Storage

`server/storage/StorageService.ts` defines a small interface (`upload`, `download`, `delete`, `getSignedUrl`, `exists`) with two implementations, selected by `STORAGE_PROVIDER`:

- **`local`** (`server/storage/local.server.ts`) — writes to a directory on disk (`STORAGE_LOCAL_DIR`, default `./.data/storage`). **Development only.** "Signed URLs" are simulated with an HMAC-signed, time-limited token verified by `app/routes/api.storage.local.$token.tsx` — the token itself is the authorization, exactly like a real presigned URL, so this route deliberately does not also require a Shopify session.
- **`s3` / `r2` / `supabase`** (`server/storage/s3.server.ts`) — all three speak the S3 API, so one adapter covers all of them. Point `S3_ENDPOINT` at R2's or Supabase's S3-compatible endpoint; leave it unset for real AWS S3. Uses real presigned URLs via `@aws-sdk/s3-request-presigner`.

## Never public

Every upload is private (`ACL: "private"` on S3). The only read path is a signed URL, which defaults to a 15-minute expiry (`StoreSettings.signedUrlTtlSeconds`, spec §67) and is scoped to the merchant's own authenticated session — `app/routes/api.invoices.$id.pdf.tsx` checks `shopId` ownership before minting one.

## Key layout

```
invoices/<shopDomain>/<invoiceNumber>/v<version>.pdf
company-logo/<shopId>.<ext>
```

## Switching providers in production

Set `STORAGE_PROVIDER=s3` (or `r2`/`supabase`), `S3_BUCKET`, `S3_REGION`, and (for R2/Supabase) `S3_ENDPOINT`, plus `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`. No code change needed — `server/storage/index.server.ts` picks the implementation at runtime.
