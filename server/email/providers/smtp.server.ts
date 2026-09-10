import nodemailer, { type Transporter } from "nodemailer";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../EmailProvider";
import { Errors } from "../../lib/errors.server";

/** Fallback provider (spec §18) for merchants who'd rather use their own SMTP relay. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "SMTP" as const;
  private transporter: Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    if (!host) {
      throw Errors.invalidConfiguration("SMTP_HOST is required when EMAIL_PROVIDER=smtp");
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
    });
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: input.from,
        to: input.to,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return { providerMessageId: info.messageId };
    } catch (error) {
      throw Errors.emailFailed(error);
    }
  }
}
