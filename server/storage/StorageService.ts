/** Storage abstraction (spec §17, §63). Swappable provider, never a public
 * bucket — PDFs are private object storage with expiring signed URLs. */
export interface SignedUrlOptions {
  filename?: string;
  disposition?: "inline" | "attachment";
}

export interface StorageService {
  upload(key: string, data: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds: number, options?: SignedUrlOptions): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export function invoicePdfKey(shopDomain: string, invoiceNumber: string, version: number): string {
  const safeInvoiceNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `invoices/${shopDomain}/${safeInvoiceNumber}/v${version}.pdf`;
}

export function invoicePdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `Invoice-${safe}.pdf`;
}
