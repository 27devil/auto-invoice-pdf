import type { EmailProvider, SendEmailInput, SendEmailResult } from "../EmailProvider";
import { Errors } from "../../lib/errors.server";

/**
 * SendGrid / SES adapters (spec §47): the interface is implemented and
 * selectable via EMAIL_PROVIDER, but the HTTP calls are stubbed rather than
 * shipped half-tested. Fill in `sendEmail` following the same shape as
 * ResendEmailProvider (server/email/providers/resend.server.ts) when you're
 * ready to switch — the rest of the app (InvoiceEmailService, retry/backoff,
 * EmailDelivery logging) does not change.
 */
export class SendGridEmailProvider implements EmailProvider {
  readonly name = "SENDGRID" as const;

  async sendEmail(_input: SendEmailInput): Promise<SendEmailResult> {
    throw Errors.invalidConfiguration(
      "The SendGrid adapter is a stub — implement server/email/providers/sendgrid.server.ts (see file header) before setting EMAIL_PROVIDER=sendgrid.",
    );
  }
}

export class SesEmailProvider implements EmailProvider {
  readonly name = "SES" as const;

  async sendEmail(_input: SendEmailInput): Promise<SendEmailResult> {
    throw Errors.invalidConfiguration(
      "The Amazon SES adapter is a stub — implement server/email/providers/ses.server.ts (see file header) before setting EMAIL_PROVIDER=ses.",
    );
  }
}
