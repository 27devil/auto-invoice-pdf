import type { LoaderFunctionArgs } from "react-router";
import { verifyLocalToken, getStorageService } from "../../server/storage/index.server";

/**
 * Simulates an S3 presigned URL for local development (spec §17, §67): the
 * HMAC-signed, time-limited token IS the authorization — deliberately no
 * Shopify session check here, matching how a real signed URL behaves.
 * Never used in production (STORAGE_PROVIDER=s3/r2/supabase redirects to
 * the real provider instead — see api.invoices.$id.pdf.tsx).
 */
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token;
  if (!token) return new Response("Not found", { status: 404 });

  const verified = verifyLocalToken(token);
  if (!verified) {
    return new Response("This link has expired or is invalid.", { status: 403 });
  }

  const storage = await getStorageService();
  const exists = await storage.exists(verified.key);
  if (!exists) return new Response("Not found", { status: 404 });

  const buffer = await storage.download(verified.key);
  const filename = verified.filename || "invoice.pdf";
  const disposition = verified.disposition || "inline";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename.replace(/"/g, "")}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
};
