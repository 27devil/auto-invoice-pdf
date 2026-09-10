import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrInitShopSettings, validateEmailSettingsForAutoSend } from "../../server/settings/SettingsService.server";
import { getStorageService } from "../../server/storage/index.server";
import { validateLogoUpload } from "../../server/lib/imageValidation.server";
import { InvoiceEmailService } from "../../server/email/InvoiceEmailService";
import { AppError } from "../../server/lib/errors.server";
import { recordAuditLog } from "../../server/lib/audit.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
  const full = await getOrInitShopSettings(prisma, shop.id);
  return { shop: full };
};

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function bool(form: FormData, key: string): boolean {
  return form.get(key) === "on" || form.get(key) === "true";
}
function num(form: FormData, key: string, fallback: number): number {
  const v = Number(form.get(key));
  return Number.isFinite(v) ? v : fallback;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain: session.shop } });
  await getOrInitShopSettings(prisma, shop.id);

  const form = await request.formData();
  const intent = form.get("intent");

  try {
    switch (intent) {
      case "general": {
        await prisma.storeSettings.update({
          where: { shopId: shop.id },
          data: { invoicingEnabled: bool(form, "invoicingEnabled") },
        });
        return { ok: true, section: "general", message: "General settings saved." };
      }

      case "company": {
        await prisma.companyProfile.update({
          where: { shopId: shop.id },
          data: {
            companyName: str(form, "companyName"),
            legalBusinessName: str(form, "legalBusinessName") || null,
            addressLine1: str(form, "addressLine1") || null,
            addressLine2: str(form, "addressLine2") || null,
            city: str(form, "city") || null,
            state: str(form, "state") || null,
            postalCode: str(form, "postalCode") || null,
            country: str(form, "country") || null,
            phone: str(form, "phone") || null,
            email: str(form, "email") || null,
            website: str(form, "website") || null,
            taxId: str(form, "taxId") || null,
            registrationNumber: str(form, "registrationNumber") || null,
            bankDetails: str(form, "bankDetails") || null,
          },
        });
        return { ok: true, section: "company", message: "Company profile saved." };
      }

      case "logo": {
        const file = form.get("logo");
        if (!(file instanceof File) || file.size === 0) {
          return { ok: false, section: "company", message: "Choose an image file first." };
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { ext, mime } = validateLogoUpload(bytes, file.size);
        const storage = await getStorageService();
        const key = `company-logo/${shop.id}.${ext}`;
        await storage.upload(key, Buffer.from(bytes), mime);
        await prisma.companyProfile.update({ where: { shopId: shop.id }, data: { logoStorageKey: key } });
        return { ok: true, section: "company", message: "Logo uploaded." };
      }

      case "numbering": {
        await prisma.storeSettings.update({
          where: { shopId: shop.id },
          data: {
            invoiceNumberPrefix: str(form, "invoiceNumberPrefix") || "INV",
            invoiceNumberFormat: str(form, "invoiceNumberFormat") || "{PREFIX}-{YEAR}-{SEQUENCE}",
            invoiceNumberPadding: num(form, "invoiceNumberPadding", 6),
            invoiceNumberStart: num(form, "invoiceNumberStart", 1),
            invoiceNumberReset: str(form, "invoiceNumberReset") as never,
            dateFormat: str(form, "dateFormat") || "dd MMM yyyy",
            dueDateDaysOut: num(form, "dueDateDaysOut", 0),
          },
        });
        return { ok: true, section: "numbering", message: "Invoice numbering saved." };
      }

      case "design": {
        await prisma.invoiceDesignSettings.update({
          where: { shopId: shop.id },
          data: {
            accentColor: str(form, "accentColor") || "#1A1A1A",
            fontFamily: str(form, "fontFamily") || "Helvetica",
            showSku: bool(form, "showSku"),
            showProductImage: bool(form, "showProductImage"),
            showDiscount: bool(form, "showDiscount"),
            showTax: bool(form, "showTax"),
            showShipping: bool(form, "showShipping"),
            showCustomerPhone: bool(form, "showCustomerPhone"),
            showCompanyOnBill: bool(form, "showCompanyOnBill"),
            showPaymentInfo: bool(form, "showPaymentInfo"),
            showBankInfo: bool(form, "showBankInfo"),
            showNotes: bool(form, "showNotes"),
            footerText: str(form, "footerText"),
            termsText: str(form, "termsText"),
            defaultNotes: str(form, "defaultNotes"),
          },
        });
        return { ok: true, section: "design", message: "Invoice template saved." };
      }

      case "tax": {
        await prisma.taxSettings.update({
          where: { shopId: shop.id },
          data: {
            taxDisplay: str(form, "taxDisplay") as never,
            defaultTaxLabel: str(form, "defaultTaxLabel") || "Tax",
            showIndiaGstFields: bool(form, "showIndiaGstFields"),
            companyGstin: str(form, "companyGstin") || null,
            gstinMetafield: str(form, "gstinMetafield") || null,
            poNumberMetafield: str(form, "poNumberMetafield") || null,
            companyNameMetafield: str(form, "companyNameMetafield") || null,
          },
        });
        return { ok: true, section: "tax", message: "Tax settings saved." };
      }

      case "email": {
        const autoEmailEnabled = bool(form, "autoEmailEnabled");
        const next = {
          deliveryMode: str(form, "deliveryMode") as never,
          provider: str(form, "provider") as never,
          senderName: str(form, "senderName") || null,
          senderEmail: str(form, "senderEmail") || null,
          replyTo: str(form, "replyTo") || null,
          subjectTemplate: str(form, "subjectTemplate"),
          greetingTemplate: str(form, "greetingTemplate"),
          bodyTemplate: str(form, "bodyTemplate"),
          footerTemplate: str(form, "footerTemplate"),
          testMode: bool(form, "testMode"),
          testEmailAddress: str(form, "testEmailAddress") || null,
        };

        if (autoEmailEnabled) {
          validateEmailSettingsForAutoSend({ provider: next.provider, senderEmail: next.senderEmail });
        }

        await prisma.emailSettings.update({
          where: { shopId: shop.id },
          data: { ...next, autoEmailEnabled },
        });
        return { ok: true, section: "email", message: "Email settings saved." };
      }

      case "sendTestEmail": {
        const testRecipient = str(form, "testRecipient");
        if (!testRecipient) return { ok: false, section: "email", message: "Enter a recipient email first." };
        const emailService = new InvoiceEmailService(prisma);
        await emailService.sendTestEmail(shop.id, testRecipient);
        return { ok: true, section: "email", message: `Test email sent to ${testRecipient}.` };
      }

      case "storage": {
        await prisma.storeSettings.update({
          where: { shopId: shop.id },
          data: {
            storageProvider: str(form, "storageProvider") as never,
            storageBucket: str(form, "storageBucket") || null,
            storageRegion: str(form, "storageRegion") || null,
            storageEndpoint: str(form, "storageEndpoint") || null,
            signedUrlTtlSeconds: num(form, "signedUrlTtlSeconds", 900),
          },
        });
        return { ok: true, section: "storage", message: "Storage settings saved. Access keys are configured via environment variables, not here." };
      }

      case "advanced": {
        await prisma.storeSettings.update({
          where: { shopId: shop.id },
          data: {
            testModeEnabled: bool(form, "testModeEnabled"),
            maxEmailRetries: num(form, "maxEmailRetries", 5),
            dataRetentionDays: form.get("dataRetentionDays") ? num(form, "dataRetentionDays", 0) || null : null,
          },
        });
        return { ok: true, section: "advanced", message: "Advanced settings saved." };
      }

      default:
        return { ok: false, section: "", message: "Unknown settings action." };
    }
  } catch (error) {
    const message = error instanceof AppError ? error.userMessage : error instanceof Error ? error.message : "Something went wrong.";
    return { ok: false, section: String(intent), message };
  } finally {
    await recordAuditLog(prisma, { shopId: shop.id, action: "settings.updated", metadata: { intent: String(intent) }, actor: session.onlineAccessInfo?.associated_user?.email ?? "merchant" });
  }
};

export default function Settings() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Settings">
      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>
          <s-paragraph>{actionData.message}</s-paragraph>
        </s-banner>
      )}

      <s-section heading="General">
        <form method="post">
          <input type="hidden" name="intent" value="general" />
          <label style={labelStyle}>
            <input type="checkbox" name="invoicingEnabled" defaultChecked={shop.storeSettings.invoicingEnabled} /> Automatically generate an
            invoice for every new order
          </label>
          <div style={{ marginTop: 12 }}>
            <s-button type="submit">Save</s-button>
          </div>
        </form>
      </s-section>

      <s-section heading="Company">
        <form method="post" style={gridForm}>
          <input type="hidden" name="intent" value="company" />
          <Field label="Company name" name="companyName" defaultValue={shop.companyProfile.companyName} />
          <Field label="Legal business name" name="legalBusinessName" defaultValue={shop.companyProfile.legalBusinessName ?? ""} />
          <Field label="Address line 1" name="addressLine1" defaultValue={shop.companyProfile.addressLine1 ?? ""} />
          <Field label="Address line 2" name="addressLine2" defaultValue={shop.companyProfile.addressLine2 ?? ""} />
          <Field label="City" name="city" defaultValue={shop.companyProfile.city ?? ""} />
          <Field label="State / Province" name="state" defaultValue={shop.companyProfile.state ?? ""} />
          <Field label="Postal code" name="postalCode" defaultValue={shop.companyProfile.postalCode ?? ""} />
          <Field label="Country" name="country" defaultValue={shop.companyProfile.country ?? ""} />
          <Field label="Phone" name="phone" defaultValue={shop.companyProfile.phone ?? ""} />
          <Field label="Email" name="email" defaultValue={shop.companyProfile.email ?? ""} />
          <Field label="Website" name="website" defaultValue={shop.companyProfile.website ?? ""} />
          <Field label="Tax ID (GST/VAT/EIN)" name="taxId" defaultValue={shop.companyProfile.taxId ?? ""} />
          <Field label="Registration number" name="registrationNumber" defaultValue={shop.companyProfile.registrationNumber ?? ""} />
          <div style={{ gridColumn: "1 / -1" }}>
            <TextAreaField label="Bank / payment details shown on invoice" name="bankDetails" defaultValue={shop.companyProfile.bankDetails ?? ""} />
          </div>
          <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <s-button type="submit">Save company profile</s-button>
          </div>
        </form>

        <form method="post" encType="multipart/form-data" style={{ marginTop: 16 }}>
          <input type="hidden" name="intent" value="logo" />
          <label style={labelStyle} htmlFor="logo-upload-input">Logo (PNG, JPG, or WEBP, max 5MB)</label>
          <input id="logo-upload-input" type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
          {shop.companyProfile.logoStorageKey && <s-text color="subdued"> Current logo is set.</s-text>}
          <div style={{ marginTop: 8 }}>
            <s-button type="submit" variant="tertiary">
              Upload logo
            </s-button>
          </div>
        </form>
      </s-section>

      <s-section heading="Invoice numbering">
        <form method="post" style={gridForm}>
          <input type="hidden" name="intent" value="numbering" />
          <Field label="Prefix" name="invoiceNumberPrefix" defaultValue={shop.storeSettings.invoiceNumberPrefix} />
          <Field label="Format" name="invoiceNumberFormat" defaultValue={shop.storeSettings.invoiceNumberFormat} help="Tokens: {PREFIX} {YEAR} {MONTH} {SEQUENCE}" />
          <Field label="Sequence digits (padding)" name="invoiceNumberPadding" type="number" defaultValue={String(shop.storeSettings.invoiceNumberPadding)} />
          <Field label="Starting number" name="invoiceNumberStart" type="number" defaultValue={String(shop.storeSettings.invoiceNumberStart)} />
          <SelectField
            label="Reset sequence"
            name="invoiceNumberReset"
            defaultValue={shop.storeSettings.invoiceNumberReset}
            options={[
              ["NEVER", "Never (continuous)"],
              ["YEARLY", "Yearly"],
              ["MONTHLY", "Monthly"],
            ]}
          />
          <Field label="Date format" name="dateFormat" defaultValue={shop.storeSettings.dateFormat} help="dd MMM yyyy · MMM dd, yyyy · yyyy-MM-dd" />
          <Field label="Due date (days after invoice date, 0 = same day)" name="dueDateDaysOut" type="number" defaultValue={String(shop.storeSettings.dueDateDaysOut)} />
          <div style={{ gridColumn: "1 / -1" }}>
            <s-button type="submit">Save numbering</s-button>
          </div>
        </form>
      </s-section>

      <s-section heading="Invoice template">
        <form method="post" style={gridForm}>
          <input type="hidden" name="intent" value="design" />
          <Field label="Accent color" name="accentColor" defaultValue={shop.designSettings.accentColor} />
          <SelectField
            label="Font"
            name="fontFamily"
            defaultValue={shop.designSettings.fontFamily}
            options={[
              ["Helvetica", "Helvetica"],
              ["Georgia", "Georgia"],
              ["Times New Roman", "Times New Roman"],
              ["Verdana", "Verdana"],
            ]}
          />
          <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <Checkbox label="SKU" name="showSku" defaultChecked={shop.designSettings.showSku} />
            <Checkbox label="Product image" name="showProductImage" defaultChecked={shop.designSettings.showProductImage} />
            <Checkbox label="Discount" name="showDiscount" defaultChecked={shop.designSettings.showDiscount} />
            <Checkbox label="Tax" name="showTax" defaultChecked={shop.designSettings.showTax} />
            <Checkbox label="Shipping" name="showShipping" defaultChecked={shop.designSettings.showShipping} />
            <Checkbox label="Customer phone" name="showCustomerPhone" defaultChecked={shop.designSettings.showCustomerPhone} />
            <Checkbox label="Company on Bill To" name="showCompanyOnBill" defaultChecked={shop.designSettings.showCompanyOnBill} />
            <Checkbox label="Payment information" name="showPaymentInfo" defaultChecked={shop.designSettings.showPaymentInfo} />
            <Checkbox label="Bank details" name="showBankInfo" defaultChecked={shop.designSettings.showBankInfo} />
            <Checkbox label="Notes" name="showNotes" defaultChecked={shop.designSettings.showNotes} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <TextAreaField label="Footer text" name="footerText" defaultValue={shop.designSettings.footerText} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <TextAreaField label="Terms & conditions" name="termsText" defaultValue={shop.designSettings.termsText} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <TextAreaField label="Default notes" name="defaultNotes" defaultValue={shop.designSettings.defaultNotes} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <s-button type="submit">Save template</s-button>
          </div>
        </form>
      </s-section>

      <s-section heading="Tax">
        <form method="post" style={gridForm}>
          <input type="hidden" name="intent" value="tax" />
          <SelectField
            label="Tax display"
            name="taxDisplay"
            defaultValue={shop.taxSettings.taxDisplay}
            options={[
              ["TAX_EXCLUSIVE", "Prices exclude tax"],
              ["TAX_INCLUSIVE", "Prices include tax"],
            ]}
          />
          <Field label="Tax label" name="defaultTaxLabel" defaultValue={shop.taxSettings.defaultTaxLabel} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Checkbox label="Show India GST fields (GSTIN) when available" name="showIndiaGstFields" defaultChecked={shop.taxSettings.showIndiaGstFields} />
          </div>
          <Field label="Your company GSTIN" name="companyGstin" defaultValue={shop.taxSettings.companyGstin ?? ""} />
          <div style={{ gridColumn: "1 / -1" }}>
            <s-text color="subdued">
              Metafield mapping — pull values from order/customer metafields onto the invoice (namespace.key, e.g. custom.gstin). Leave blank to
              skip.
            </s-text>
          </div>
          <Field label="GSTIN / Tax ID metafield" name="gstinMetafield" defaultValue={shop.taxSettings.gstinMetafield ?? ""} />
          <Field label="PO number metafield" name="poNumberMetafield" defaultValue={shop.taxSettings.poNumberMetafield ?? ""} />
          <Field label="Company name metafield" name="companyNameMetafield" defaultValue={shop.taxSettings.companyNameMetafield ?? ""} />
          <div style={{ gridColumn: "1 / -1" }}>
            <s-button type="submit">Save tax settings</s-button>
          </div>
        </form>
      </s-section>

      <s-section heading="Email">
        <s-banner tone="info">
          <s-paragraph>
            Shopify&apos;s native order confirmation email and this app&apos;s invoice email are separate delivery systems. &quot;Native + invoice
            email&quot; (the default) sends both — Shopify&apos;s own confirmation, plus a separate email from this app with the invoice attached.
            Only choose &quot;App confirmation with invoice&quot; if you want this app to control the customer&apos;s confirmation email instead
            of Shopify, and consider turning off Shopify&apos;s native notification to avoid the customer receiving two emails.
          </s-paragraph>
        </s-banner>
        <form method="post" style={{ ...gridForm, marginTop: 12 }}>
          <input type="hidden" name="intent" value="email" />
          <div style={{ gridColumn: "1 / -1" }}>
            <SelectField
              label="Invoice delivery mode"
              name="deliveryMode"
              defaultValue={shop.emailSettings.deliveryMode}
              options={[
                ["NATIVE_PLUS_INVOICE_EMAIL", "Native Shopify confirmation + separate invoice email"],
                ["APP_CONFIRMATION_WITH_INVOICE", "App-generated confirmation email with invoice attached"],
                ["INVOICE_EMAIL_ONLY", "Invoice email only"],
                ["DISABLED", "Disabled — generate invoices, never email them"],
              ]}
            />
          </div>
          <SelectField
            label="Provider"
            name="provider"
            defaultValue={shop.emailSettings.provider}
            options={[
              ["RESEND", "Resend"],
              ["SMTP", "SMTP"],
              ["SENDGRID", "SendGrid (not yet implemented)"],
              ["SES", "Amazon SES (not yet implemented)"],
            ]}
          />
          <Field label="Sender name" name="senderName" defaultValue={shop.emailSettings.senderName ?? ""} />
          <Field label="Sender email" name="senderEmail" defaultValue={shop.emailSettings.senderEmail ?? ""} />
          <Field label="Reply-to" name="replyTo" defaultValue={shop.emailSettings.replyTo ?? ""} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Subject" name="subjectTemplate" defaultValue={shop.emailSettings.subjectTemplate} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Greeting" name="greetingTemplate" defaultValue={shop.emailSettings.greetingTemplate} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <TextAreaField label="Body" name="bodyTemplate" defaultValue={shop.emailSettings.bodyTemplate} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <TextAreaField label="Footer" name="footerTemplate" defaultValue={shop.emailSettings.footerTemplate} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <s-text color="subdued">Variables: {"{{customer_name}} {{order_number}} {{invoice_number}} {{invoice_date}} {{total}} {{currency}} {{company_name}} {{support_email}} {{shop_url}}"}</s-text>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Checkbox label="Test mode (only send to the test address below)" name="testMode" defaultChecked={shop.emailSettings.testMode} />
            <Checkbox label="Enable automatic invoice emails" name="autoEmailEnabled" defaultChecked={shop.emailSettings.autoEmailEnabled} />
          </div>
          <Field label="Test email address" name="testEmailAddress" defaultValue={shop.emailSettings.testEmailAddress ?? ""} />
          <div style={{ gridColumn: "1 / -1" }}>
            <s-button type="submit">Save email settings</s-button>
          </div>
        </form>

        <form method="post" style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="hidden" name="intent" value="sendTestEmail" />
          <Field label="Send a preview to" name="testRecipient" defaultValue="" />
          <s-button type="submit" variant="tertiary">
            Send test email
          </s-button>
        </form>
      </s-section>

      <s-section heading="Storage">
        <s-text color="subdued">Access keys and secrets are configured via environment variables (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) — never entered here.</s-text>
        <form method="post" style={{ ...gridForm, marginTop: 12 }}>
          <input type="hidden" name="intent" value="storage" />
          <SelectField
            label="Provider"
            name="storageProvider"
            defaultValue={shop.storeSettings.storageProvider}
            options={[
              ["LOCAL", "Local filesystem (development only)"],
              ["S3", "Amazon S3"],
              ["R2", "Cloudflare R2"],
              ["SUPABASE", "Supabase Storage"],
            ]}
          />
          <Field label="Bucket" name="storageBucket" defaultValue={shop.storeSettings.storageBucket ?? ""} />
          <Field label="Region" name="storageRegion" defaultValue={shop.storeSettings.storageRegion ?? ""} />
          <Field label="Endpoint (for R2/Supabase)" name="storageEndpoint" defaultValue={shop.storeSettings.storageEndpoint ?? ""} />
          <Field label="Signed URL expiry (seconds)" name="signedUrlTtlSeconds" type="number" defaultValue={String(shop.storeSettings.signedUrlTtlSeconds)} />
          <div style={{ gridColumn: "1 / -1" }}>
            <s-button type="submit">Save storage settings</s-button>
          </div>
        </form>
      </s-section>

      <s-section heading="Advanced">
        <form method="post" style={gridForm}>
          <input type="hidden" name="intent" value="advanced" />
          <div style={{ gridColumn: "1 / -1" }}>
            <Checkbox label="Test mode enabled shop-wide (recommended until you've verified a real order)" name="testModeEnabled" defaultChecked={shop.storeSettings.testModeEnabled} />
          </div>
          <Field label="Max email retry attempts" name="maxEmailRetries" type="number" defaultValue={String(shop.storeSettings.maxEmailRetries)} />
          <Field label="Data retention (days, blank = keep indefinitely)" name="dataRetentionDays" type="number" defaultValue={shop.storeSettings.dataRetentionDays ? String(shop.storeSettings.dataRetentionDays) : ""} />
          <div style={{ gridColumn: "1 / -1" }}>
            <s-button type="submit">Save advanced settings</s-button>
          </div>
        </form>
      </s-section>
    </s-page>
  );
}

const gridForm = { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px 16px" } as const;
const labelStyle = { fontSize: 13, display: "flex", alignItems: "center", gap: 8 } as const;
const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid #c9cccf", borderRadius: 6, fontSize: 13, marginTop: 4, boxSizing: "border-box" } as const;

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  help?: string;
}) {
  return (
    <label style={{ fontSize: 13, display: "block" }}>
      {label}
      <input type={type} name={name} defaultValue={defaultValue} style={inputStyle} />
      {help && (
        <span style={{ display: "block", color: "#8a97a3", fontSize: 11, marginTop: 2 }}>
          {help}
        </span>
      )}
    </label>
  );
}

function TextAreaField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label style={{ fontSize: 13, display: "block" }}>
      {label}
      <textarea name={name} defaultValue={defaultValue} rows={3} style={{ ...inputStyle, fontFamily: "inherit" }} />
    </label>
  );
}

function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: [string, string][] }) {
  return (
    <label style={{ fontSize: 13, display: "block" }}>
      {label}
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return (
    <label style={labelStyle}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} /> {label}
    </label>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
