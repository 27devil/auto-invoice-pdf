/**
 * Demo/seed data (spec §54). Creates one sample shop ("Spill Ready
 * Supplies" — a generic-enough example brand for this template) with
 * default settings and a single sample invoice so you can see the admin UI
 * populated before connecting a real dev store. Clearly marked as demo data
 * via the shop domain and customer name.
 *
 * Run with: npm run seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_SHOP_DOMAIN = "demo-shop.myshopify.com";

async function main() {
  const shop = await prisma.shop.upsert({
    where: { shopDomain: DEMO_SHOP_DOMAIN },
    create: {
      shopDomain: DEMO_SHOP_DOMAIN,
      shopName: "Demo Shop (seed data)",
      email: "demo@example.com",
      currency: "USD",
      timezone: "America/Chicago",
      country: "US",
    },
    update: {},
  });

  await prisma.companyProfile.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      companyName: "Spill Ready Supplies",
      addressLine1: "1200 Industrial Pkwy",
      city: "Austin",
      state: "TX",
      postalCode: "78744",
      country: "US",
      phone: "+1 800-555-0134",
      email: "orders@spillreadysupplies.example",
      website: "https://spillreadysupplies.example",
      taxId: "74-1234567",
      bankDetails: "Wire transfers: Example Bank, Account: ****4821, Routing: 021000021",
    },
    update: {},
  });

  await prisma.taxSettings.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} });
  await prisma.emailSettings.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, senderName: "Spill Ready Supplies", senderEmail: "invoices@spillreadysupplies.example" },
    update: {},
  });
  await prisma.storeSettings.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} });
  await prisma.invoiceDesignSettings.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} });

  const existing = await prisma.invoice.findFirst({ where: { shopId: shop.id, invoiceNumber: "INV-2026-000001" } });
  if (!existing) {
    await prisma.invoiceNumberSequence.upsert({
      where: { shopId_periodKey: { shopId: shop.id, periodKey: "2026" } },
      create: { shopId: shop.id, periodKey: "2026", nextValue: 2 },
      update: {},
    });

    await prisma.invoice.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "5000000001",
        shopifyOrderGid: "gid://shopify/Order/5000000001",
        shopifyOrderNumber: 1001,
        invoiceNumber: "INV-2026-000001",
        invoiceStatus: "GENERATED",
        currency: "USD",
        subtotal: "870.50",
        discountTotal: "5.00",
        shippingTotal: "25.00",
        taxTotal: "64.59",
        total: "955.09",
        amountPaid: "955.09",
        balanceDue: "0.00",
        paymentStatus: "PAID",
        customerName: "Jordan Sample (demo data)",
        customerEmail: "jordan.sample@example.com",
        billingAddress: {
          name: "Jordan Sample",
          company: "Sample Logistics LLC",
          address1: "742 Evergreen Terrace",
          city: "Austin",
          province: "TX",
          zip: "78701",
          country: "United States",
        },
        items: {
          create: [
            {
              sku: "SRS-UPAD-100",
              productTitle: "Universal Absorbent Pad",
              variantTitle: 'Medium - 15" x 18"',
              quantity: 50,
              unitPrice: "0.85",
              discountAmount: "5.00",
              taxAmount: "3.19",
              lineTotal: "40.69",
              position: 0,
            },
            {
              sku: "SRS-PALLET-450",
              productTitle: "Spill Containment Pallet",
              quantity: 2,
              unitPrice: "289.00",
              discountAmount: "0.00",
              taxAmount: "45.02",
              lineTotal: "623.02",
              position: 1,
            },
            {
              sku: null,
              productTitle: "Oil Absorbent Roll",
              variantTitle: "Heavy Duty",
              quantity: 5,
              unitPrice: "42.00",
              discountAmount: "0.00",
              taxAmount: "16.38",
              lineTotal: "226.38",
              position: 2,
            },
          ],
        },
      },
    });
  }

  console.log(`Seeded demo shop ${DEMO_SHOP_DOMAIN} with 1 sample invoice.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
