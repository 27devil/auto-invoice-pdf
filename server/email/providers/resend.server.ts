import { Resend } from "resend";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../EmailProvider";
import { Errors } from "../../lib/errors.server";

/** V1's fully wired provider (spec §47). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "RESEND" as const;
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await this.client.emails.send({
      from: input.from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (result.error) {
      throw Errors.emailFailed(result.error);
    }
    if (!result.data?.id) {
      throw Errors.emailFailed("Resend returned no message id");
    }

    return { providerMessageId: result.data.id };
  }
}
