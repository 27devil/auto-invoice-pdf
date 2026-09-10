-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaxDisplayMode" AS ENUM ('TAX_EXCLUSIVE', 'TAX_INCLUSIVE');

-- CreateEnum
CREATE TYPE "EmailProviderType" AS ENUM ('RESEND', 'SENDGRID', 'SES', 'SMTP');

-- CreateEnum
CREATE TYPE "InvoiceDeliveryMode" AS ENUM ('NATIVE_PLUS_INVOICE_EMAIL', 'APP_CONFIRMATION_WITH_INVOICE', 'INVOICE_EMAIL_ONLY', 'DISABLED');

-- CreateEnum
CREATE TYPE "StorageProviderType" AS ENUM ('LOCAL', 'S3', 'R2', 'SUPABASE');

-- CreateEnum
CREATE TYPE "InvoiceNumberResetPolicy" AS ENUM ('NEVER', 'YEARLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('GENERATING', 'GENERATED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "InvoiceEmailStatus" AS ENUM ('NOT_SENT', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "EmailDeliveryTrigger" AS ENUM ('AUTOMATIC', 'MANUAL_RESEND', 'TEST');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('GENERATING', 'GENERATED', 'FAILED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyShopGid" TEXT,
    "shopName" TEXT,
    "email" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "country" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "plan" TEXT NOT NULL DEFAULT 'free',
    "subscriptionStatus" TEXT,
    "billingCustomerId" TEXT,
    "billingSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "legalBusinessName" TEXT,
    "logoStorageKey" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "bankDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "taxDisplay" "TaxDisplayMode" NOT NULL DEFAULT 'TAX_EXCLUSIVE',
    "defaultTaxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "showIndiaGstFields" BOOLEAN NOT NULL DEFAULT false,
    "companyGstin" TEXT,
    "gstinMetafield" TEXT,
    "poNumberMetafield" TEXT,
    "companyNameMetafield" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "deliveryMode" "InvoiceDeliveryMode" NOT NULL DEFAULT 'NATIVE_PLUS_INVOICE_EMAIL',
    "autoEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" "EmailProviderType" NOT NULL DEFAULT 'RESEND',
    "senderName" TEXT,
    "senderEmail" TEXT,
    "replyTo" TEXT,
    "subjectTemplate" TEXT NOT NULL DEFAULT 'Order #{{order_number}} confirmed — Invoice {{invoice_number}}',
    "greetingTemplate" TEXT NOT NULL DEFAULT 'Hello {{customer_name}},',
    "bodyTemplate" TEXT NOT NULL DEFAULT 'Thank you for your order with {{company_name}}.

Your order #{{order_number}} has been confirmed. Your invoice is attached to this email.

Invoice: {{invoice_number}}
Order total: {{currency}} {{total}}

If you have any questions, contact {{support_email}}.',
    "footerTemplate" TEXT NOT NULL DEFAULT 'Regards,
{{company_name}}',
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "testEmailAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "invoicingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "invoiceNumberPrefix" TEXT NOT NULL DEFAULT 'INV',
    "invoiceNumberFormat" TEXT NOT NULL DEFAULT '{PREFIX}-{YEAR}-{SEQUENCE}',
    "invoiceNumberPadding" INTEGER NOT NULL DEFAULT 6,
    "invoiceNumberStart" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumberReset" "InvoiceNumberResetPolicy" NOT NULL DEFAULT 'YEARLY',
    "creditNoteNumberPrefix" TEXT NOT NULL DEFAULT 'CN',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd MMM yyyy',
    "dueDateDaysOut" INTEGER NOT NULL DEFAULT 0,
    "storageProvider" "StorageProviderType" NOT NULL DEFAULT 'LOCAL',
    "storageBucket" TEXT,
    "storageRegion" TEXT,
    "storageEndpoint" TEXT,
    "signedUrlTtlSeconds" INTEGER NOT NULL DEFAULT 900,
    "testModeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dataRetentionDays" INTEGER,
    "maxEmailRetries" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDesignSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL DEFAULT '#1A1A1A',
    "fontFamily" TEXT NOT NULL DEFAULT 'Helvetica',
    "showSku" BOOLEAN NOT NULL DEFAULT true,
    "showProductImage" BOOLEAN NOT NULL DEFAULT false,
    "showDiscount" BOOLEAN NOT NULL DEFAULT true,
    "showTax" BOOLEAN NOT NULL DEFAULT true,
    "showShipping" BOOLEAN NOT NULL DEFAULT true,
    "showCustomerPhone" BOOLEAN NOT NULL DEFAULT false,
    "showCompanyOnBill" BOOLEAN NOT NULL DEFAULT true,
    "showPaymentInfo" BOOLEAN NOT NULL DEFAULT true,
    "showBankInfo" BOOLEAN NOT NULL DEFAULT false,
    "showNotes" BOOLEAN NOT NULL DEFAULT true,
    "footerText" TEXT NOT NULL DEFAULT 'Thank you for your business.',
    "termsText" TEXT NOT NULL DEFAULT '',
    "defaultNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDesignSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceNumberSequence" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderGid" TEXT NOT NULL,
    "shopifyOrderNumber" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceStatus" "InvoiceStatus" NOT NULL DEFAULT 'GENERATING',
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "pdfVersion" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "discountTotal" DECIMAL(18,4) NOT NULL,
    "shippingTotal" DECIMAL(18,4) NOT NULL,
    "taxTotal" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "amountPaid" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(18,4) NOT NULL,
    "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "billingAddress" JSONB,
    "shippingAddress" JSONB,
    "companyName" TEXT,
    "customerTaxId" TEXT,
    "poNumber" TEXT,
    "pdfStorageKey" TEXT,
    "pdfChecksum" TEXT,
    "emailStatus" "InvoiceEmailStatus" NOT NULL DEFAULT 'NOT_SENT',
    "emailStatusReason" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "currentJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT,
    "sku" TEXT,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "recipient" TEXT NOT NULL,
    "trigger" "EmailDeliveryTrigger" NOT NULL DEFAULT 'AUTOMATIC',
    "provider" "EmailProviderType" NOT NULL,
    "providerMessageId" TEXT,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "shopDomain" TEXT NOT NULL,
    "shopifyWebhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "shopifyRefundId" TEXT,
    "creditNoteNumber" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'GENERATING',
    "currency" TEXT NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "pdfStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_shopId_key" ON "CompanyProfile"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxSettings_shopId_key" ON "TaxSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSettings_shopId_key" ON "EmailSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettings_shopId_key" ON "StoreSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDesignSettings_shopId_key" ON "InvoiceDesignSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceNumberSequence_shopId_periodKey_key" ON "InvoiceNumberSequence"("shopId", "periodKey");

-- CreateIndex
CREATE INDEX "Invoice_shopId_createdAt_idx" ON "Invoice"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_shopId_customerEmail_idx" ON "Invoice"("shopId", "customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shopId_invoiceNumber_key" ON "Invoice"("shopId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shopId_shopifyOrderId_key" ON "Invoice"("shopId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "EmailDelivery_shopId_invoiceId_idx" ON "EmailDelivery"("shopId", "invoiceId");

-- CreateIndex
CREATE INDEX "WebhookEvent_shopId_topic_idx" ON "WebhookEvent"("shopId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_shopifyWebhookId_key" ON "WebhookEvent"("shopifyWebhookId");

-- CreateIndex
CREATE INDEX "AuditLog_shopId_createdAt_idx" ON "AuditLog"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_shopId_creditNoteNumber_key" ON "CreditNote"("shopId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "Customer_shopId_email_idx" ON "Customer"("shopId", "email");

-- CreateIndex
CREATE INDEX "Customer_shopId_shopifyCustomerId_idx" ON "Customer"("shopId", "shopifyCustomerId");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxSettings" ADD CONSTRAINT "TaxSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSettings" ADD CONSTRAINT "EmailSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDesignSettings" ADD CONSTRAINT "InvoiceDesignSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceNumberSequence" ADD CONSTRAINT "InvoiceNumberSequence_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

