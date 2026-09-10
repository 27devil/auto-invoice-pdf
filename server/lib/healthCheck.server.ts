import prisma from "../../app/db.server";
import { getRedisConnection } from "../queue/connection.server";
import { getQueueCounts } from "../queue/jobs";

export type ComponentStatus = "healthy" | "warning" | "error";

export interface ComponentHealth {
  name: string;
  status: ComponentStatus;
  detail: string;
}

async function checkDatabase(): Promise<ComponentHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "Database", status: "healthy", detail: "Connected" };
  } catch (error) {
    return { name: "Database", status: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function checkQueue(): Promise<ComponentHealth> {
  if (!process.env.REDIS_URL) {
    return { name: "Queue", status: "error", detail: "REDIS_URL is not configured" };
  }
  try {
    const redis = getRedisConnection();
    await redis.ping();
    const counts = await getQueueCounts();
    const status: ComponentStatus = counts.failed > 20 ? "warning" : "healthy";
    return {
      name: "Queue",
      status,
      detail: `waiting=${counts.waiting} active=${counts.active} failed=${counts.failed}`,
    };
  } catch (error) {
    return { name: "Queue", status: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

function checkStorage(): ComponentHealth {
  const provider = process.env.STORAGE_PROVIDER || "local";
  if (provider === "local") {
    return { name: "Storage", status: "warning", detail: "Using local filesystem storage — not suitable for production" };
  }
  if (provider !== "s3" && !process.env.S3_BUCKET) {
    return { name: "Storage", status: "error", detail: `STORAGE_PROVIDER=${provider} but S3_BUCKET is not set` };
  }
  return { name: "Storage", status: "healthy", detail: `Provider: ${provider}` };
}

function checkEmail(): ComponentHealth {
  const provider = process.env.EMAIL_PROVIDER || "resend";
  if (provider === "resend" && !process.env.RESEND_API_KEY) {
    return { name: "Email provider", status: "warning", detail: "RESEND_API_KEY not set — automatic emails will fail" };
  }
  if (provider === "smtp" && !process.env.SMTP_HOST) {
    return { name: "Email provider", status: "warning", detail: "SMTP_HOST not set — automatic emails will fail" };
  }
  return { name: "Email provider", status: "healthy", detail: `Provider: ${provider}` };
}

function checkShopifyApi(): ComponentHealth {
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
    return { name: "Shopify API", status: "error", detail: "SHOPIFY_API_KEY / SHOPIFY_API_SECRET not set" };
  }
  return { name: "Shopify API", status: "healthy", detail: "Credentials configured" };
}

export async function runHealthChecks(): Promise<ComponentHealth[]> {
  const [database, queue] = await Promise.all([checkDatabase(), checkQueue()]);
  return [database, queue, checkStorage(), checkEmail(), checkShopifyApi()];
}
