import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const FAQ: Array<[string, string]> = [
  [
    "How are invoices generated?",
    "Every new order fires Shopify's orders/create webhook. The app validates it, queues a background job, fetches the full order from the Admin API, and renders a PDF — usually within a few seconds.",
  ],
  [
    "When are invoices emailed?",
    "Only if Settings → Email → \"Enable automatic invoice emails\" is on and a delivery mode other than Disabled is selected. See the delivery-mode explanation on the Email settings section — Shopify's native order confirmation and this app's invoice email are independent systems.",
  ],
  [
    "How do invoice numbers work?",
    "Configured in Settings → Invoice numbering. Numbers are allocated atomically per shop, so two orders created at the same instant can never collide. Changing the prefix/format only affects future invoices.",
  ],
  ["How do I change the invoice design?", "Settings → Invoice template lets you set an accent color, font, and which optional fields (SKU, tax, discount, images, bank info, etc.) appear."],
  ["How do I resend an invoice?", "Open the invoice from the Invoices list and click \"Resend invoice\". This always sends again, bypassing duplicate-send protection."],
  [
    "Why wasn't an invoice emailed?",
    "Check the invoice detail page — a banner explains the reason (most commonly: the order had no email address, or automatic email isn't enabled yet).",
  ],
  ["How do I configure email?", "Settings → Email. Automatic sending is blocked until a sender email and a provider (Resend by default) are configured."],
  ["How do I configure storage?", "Settings → Storage. Local filesystem storage is for development only — set a real provider (S3/R2/Supabase) before going to production."],
  [
    "How do Shopify order confirmation emails work?",
    "Shopify always sends its own native order confirmation unless you disable it in Shopify admin → Settings → Notifications. This app's invoice email is separate and additive by default.",
  ],
];

export default function Help() {
  return (
    <s-page heading="Help">
      <s-section heading="Frequently asked questions">
        <s-stack direction="block" gap="base">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <s-text type="strong">{q}</s-text>
              <s-paragraph>{a}</s-paragraph>
            </div>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
