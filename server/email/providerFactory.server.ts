import type { EmailProvider } from "./EmailProvider";
import type { EmailProviderType } from "@prisma/client";
import { Errors } from "../lib/errors.server";

/**
 * Provider credentials always come from server-side env vars, never from
 * merchant-entered frontend/browser fields (spec §116). Each adapter module
 * is imported lazily so a shop that only ever uses Resend never needs the
 * SMTP/SendGrid/SES dependencies loaded.
 */
export async function getEmailProvider(type: EmailProviderType): Promise<EmailProvider> {
  switch (type) {
    case "RESEND": {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw Errors.invalidConfiguration("RESEND_API_KEY is not set. Configure email before enabling automatic invoice emails.");
      }
      const { ResendEmailProvider } = await import("./providers/resend.server");
      return new ResendEmailProvider(apiKey);
    }
    case "SMTP": {
      const { SmtpEmailProvider } = await import("./providers/smtp.server");
      return new SmtpEmailProvider();
    }
    case "SENDGRID": {
      const { SendGridEmailProvider } = await import("./providers/stubs.server");
      return new SendGridEmailProvider();
    }
    case "SES": {
      const { SesEmailProvider } = await import("./providers/stubs.server");
      return new SesEmailProvider();
    }
    default:
      throw Errors.invalidConfiguration(`Unknown email provider "${type}"`);
  }
}
