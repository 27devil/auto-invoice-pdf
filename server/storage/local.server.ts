import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StorageService, SignedUrlOptions } from "./StorageService";
import { Errors } from "../lib/errors.server";

const LOCAL_DIR = process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), ".data", "storage");

function resolvePath(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
  return path.join(LOCAL_DIR, normalized);
}

/**
 * Filesystem-backed storage for local development ONLY (spec §17). Signed
 * URLs are simulated with an HMAC-signed, time-limited token verified by
 * `app/routes/api.storage.local.$token.tsx` — never a directly browsable path.
 */
export class LocalStorageService implements StorageService {
  async upload(key: string, data: Buffer, _contentType: string): Promise<void> {
    const target = resolvePath(key);
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
    } catch (error) {
      throw Errors.storageFailed(error);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(resolvePath(key));
    } catch (error) {
      throw Errors.storageFailed(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(resolvePath(key));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw Errors.storageFailed(error);
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number, options?: SignedUrlOptions): Promise<string> {
    const token = signLocalToken(key, expiresInSeconds, options);
    return `/api/storage/local/${token}`;
  }
}

const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret";

export function signLocalToken(key: string, expiresInSeconds: number, options?: SignedUrlOptions): string {
  const expires = Date.now() + expiresInSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ key, expires, ...options })).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyLocalToken(token: string): (SignedUrlOptions & { key: string }) | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = createHmac("sha256", SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const { key, expires, filename, disposition } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > expires) return null;
    return { key, filename, disposition };
  } catch {
    return null;
  }
}
