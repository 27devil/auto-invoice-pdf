import { describe, it, expect } from "vitest";
import { renderTemplate, buildEmailBody, textToHtml } from "../../server/email/template";

const vars = {
  customer_name: "Jordan Sample",
  order_number: "1001",
  invoice_number: "INV-2026-000001",
  invoice_date: "Thu Sep 10 2026",
  total: "USD 118.50",
  currency: "USD",
  company_name: "Spill Ready Supplies",
  support_email: "support@spillready.example",
  shop_url: "https://spillready.example",
};

describe("renderTemplate", () => {
  it("substitutes every {{variable}} token", () => {
    const out = renderTemplate("Hello {{customer_name}}, order #{{order_number}} totals {{total}}.", vars);
    expect(out).toBe("Hello Jordan Sample, order #1001 totals USD 118.50.");
  });

  it("leaves an unknown token untouched rather than silently dropping it", () => {
    const out = renderTemplate("Value: {{not_a_real_variable}}", vars);
    expect(out).toBe("Value: {{not_a_real_variable}}");
  });

  it("tolerates extra whitespace inside the braces", () => {
    expect(renderTemplate("{{  customer_name  }}", vars)).toBe("Jordan Sample");
  });
});

describe("textToHtml", () => {
  it("escapes HTML and converts newlines to <br/>", () => {
    const out = textToHtml("Hi <b>there</b>\nSecond line");
    expect(out).toBe("Hi &lt;b&gt;there&lt;/b&gt;<br/>Second line");
  });
});

describe("buildEmailBody", () => {
  it("renders the default template with all placeholders filled in", () => {
    const { text, html } = buildEmailBody(
      {
        greeting: "Hello {{customer_name}},",
        body: "Your order #{{order_number}} is confirmed. Invoice: {{invoice_number}}. Total: {{currency}} {{total}}.",
        footer: "Regards,\n{{company_name}}",
      },
      vars,
    );

    expect(text).toContain("Hello Jordan Sample,");
    expect(text).toContain("Invoice: INV-2026-000001.");
    expect(text).toContain("Regards,\nSpill Ready Supplies");
    expect(html).toContain("Hello Jordan Sample,");
    expect(html).not.toContain("{{"); // no unresolved tokens leak into the sent email
  });
});
