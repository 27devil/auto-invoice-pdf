import type { StorageService } from "../storage/StorageService";

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** PDF rendering never fetches the network (spec §61 independence + determinism),
 * so the logo is resolved to a data: URL up front from StorageService. */
export async function resolveLogoDataUrl(storage: StorageService, logoStorageKey: string | null): Promise<string | null> {
  if (!logoStorageKey) return null;
  const ext = logoStorageKey.split(".").pop()?.toLowerCase() ?? "png";
  const mime = EXT_TO_MIME[ext] ?? "image/png";
  try {
    const exists = await storage.exists(logoStorageKey);
    if (!exists) return null;
    const bytes = await storage.download(logoStorageKey);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    // A missing/corrupt logo must never break invoice generation (spec §11).
    return null;
  }
}
