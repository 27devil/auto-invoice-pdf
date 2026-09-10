export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailInput {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
}

export interface SendEmailResult {
  providerMessageId: string;
}

/** All providers implement this — see spec §47. */
export interface EmailProvider {
  readonly name: "RESEND" | "SENDGRID" | "SES" | "SMTP";
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
