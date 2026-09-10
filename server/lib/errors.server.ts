/** Typed application errors (spec §38). Internal messages are logged in full;
 * only `userMessage` should ever reach the admin UI. */

export type AppErrorCode =
  | "SHOPIFY_API_ERROR"
  | "ORDER_NOT_FOUND"
  | "INVOICE_EXISTS"
  | "PDF_GENERATION_FAILED"
  | "STORAGE_FAILED"
  | "EMAIL_FAILED"
  | "INVALID_WEBHOOK"
  | "MISSING_CUSTOMER_EMAIL"
  | "INVALID_CONFIGURATION";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly userMessage: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  shopifyApi: (message: string, cause?: unknown) =>
    new AppError(
      "SHOPIFY_API_ERROR",
      message,
      "We couldn't reach Shopify to fetch order details. The system will retry automatically.",
      cause,
    ),
  orderNotFound: (orderId: string) =>
    new AppError(
      "ORDER_NOT_FOUND",
      `Order ${orderId} was not found or is not yet available via the Admin API`,
      "This order couldn't be found yet. It will be retried shortly in case Shopify hasn't finished processing it.",
    ),
  invoiceExists: (invoiceNumber: string) =>
    new AppError(
      "INVOICE_EXISTS",
      `Invoice ${invoiceNumber} already exists for this order`,
      "An invoice already exists for this order.",
    ),
  pdfGenerationFailed: (cause?: unknown) =>
    new AppError(
      "PDF_GENERATION_FAILED",
      "PDF rendering failed",
      "We couldn't generate the invoice because the PDF service failed. The system will retry automatically.",
      cause,
    ),
  storageFailed: (cause?: unknown) =>
    new AppError(
      "STORAGE_FAILED",
      "Storage upload/download failed",
      "We couldn't save the invoice file. The system will retry automatically.",
      cause,
    ),
  emailFailed: (cause?: unknown) =>
    new AppError(
      "EMAIL_FAILED",
      "Email send failed",
      "We couldn't send the invoice email. The system will retry automatically.",
      cause,
    ),
  invalidWebhook: (message: string) =>
    new AppError("INVALID_WEBHOOK", message, "This request could not be verified as coming from Shopify."),
  missingCustomerEmail: () =>
    new AppError(
      "MISSING_CUSTOMER_EMAIL",
      "Order has no usable customer email",
      "This order has no email on file, so the invoice was generated but not sent. You can download and send it manually.",
    ),
  invalidConfiguration: (message: string) =>
    new AppError("INVALID_CONFIGURATION", message, message),
};
