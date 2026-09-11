import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getStorageService, invoicePdfFilename } from "../../server/storage/index.server";

/**
 * Authenticated PDF streaming (spec §44, §45, §67): the merchant's session
 * is what authorizes this, then StorageService hands back either a signed
 * URL (S3/R2) we redirect to, or the local dev route we stream through —
 * either way the caller never sees a raw, permanently-public storage path.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });

  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { id: params.id, shopId: shop.id }, // tenant isolation (spec §32)
  });

  if (!invoice.pdfStorageKey) {
    return Response.json(
      { error: "PDF has not been generated yet. It will be ready shortly after the order was created." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  const storage = await getStorageService();
  const ttl = 900; // spec §67: signed URLs expire, 15 minutes by default
  const signedUrl = await storage.getSignedUrl(invoice.pdfStorageKey, ttl, {
    filename: invoicePdfFilename(invoice.invoiceNumber),
    disposition: download ? "attachment" : "inline",
  });

  // Return the signed URL as JSON instead of redirecting: this route is
  // authenticated (authenticate.admin), and Shopify's embedded App Bridge
  // only attaches the session token to same-origin fetch()/XHR calls made
  // from the app's own JS -- never to a raw <iframe src> or <a href>
  // navigation. The frontend fetches this JSON (authenticated, same-origin)
  // and then opens the *external* signed URL directly, which needs no
  // Shopify auth at all.
  return Response.json({ url: new URL(signedUrl, request.url).toString() });
};
