import type { StorageService } from "./StorageService";
import { LocalStorageService } from "./local.server";

export * from "./StorageService";
export { verifyLocalToken } from "./local.server";

let cached: StorageService | null = null;

/**
 * Provider is chosen by STORAGE_PROVIDER (spec §17). S3 module is imported
 * lazily so a local-only dev environment never needs AWS SDK credentials
 * configured to boot.
 */
export async function getStorageService(): Promise<StorageService> {
  if (cached) return cached;

  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();

  if (provider === "local") {
    cached = new LocalStorageService();
    return cached;
  }

  if (provider === "s3" || provider === "r2" || provider === "supabase") {
    const { S3StorageService } = await import("./s3.server");
    cached = new S3StorageService();
    return cached;
  }

  throw new Error(`Unknown STORAGE_PROVIDER "${provider}". Expected local | s3 | r2 | supabase.`);
}
