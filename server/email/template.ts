/** Variable substitution for merchant-editable email templates (spec §19). */
export interface EmailTemplateVariables {
  customer_name: string;
  order_number: string;
  invoice_number: string;
  invoice_date: string;
  total: string;
  currency: string;
  company_name: string;
  support_email: string;
  shop_url: string;
}

export function renderTemplate(template: string, vars: EmailTemplateVariables): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => {
    const value = (vars as unknown as Record<string, string>)[key];
    return value !== undefined ? value : match;
  });
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br/>");
}

export function buildEmailBody(
  templates: { greeting: string; body: string; footer: string },
  vars: EmailTemplateVariables,
): { html: string; text: string } {
  const parts = [templates.greeting, "", templates.body, "", templates.footer]
    .map((part) => renderTemplate(part, vars))
    .join("\n");

  return {
    text: parts,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1f2328;line-height:1.6;">${textToHtml(parts)}</div>`,
  };
}
