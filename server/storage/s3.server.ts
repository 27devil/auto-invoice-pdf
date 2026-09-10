import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageService, SignedUrlOptions } from "./StorageService";
import { Errors } from "../lib/errors.server";

/**
 * S3-compatible storage (spec §17). Works against AWS S3, Cloudflare R2, or
 * any S3-compatible endpoint (Supabase Storage included) by pointing
 * S3_ENDPOINT at the provider's S3-compatible URL — see docs/storage.md.
 */
export class S3StorageService implements StorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw Errors.invalidConfiguration("S3_BUCKET is required when STORAGE_PROVIDER is not 'local'");
    }
    this.bucket = bucket;
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT), // required for R2/most S3-compatible providers
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
          // Never public: signed URLs are the only supported read path (spec §67).
          ACL: "private",
        }),
      );
    } catch (error) {
      throw Errors.storageFailed(error);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const chunks: Uint8Array[] = [];
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      throw Errors.storageFailed(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw Errors.storageFailed(error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number, options?: SignedUrlOptions): Promise<string> {
    try {
      const disposition = options?.filename
        ? `${options.disposition ?? "inline"}; filename="${options.filename.replace(/"/g, "")}"`
        : undefined;
      return await awsGetSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: disposition,
          ResponseContentType: "application/pdf",
        }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error) {
      throw Errors.storageFailed(error);
    }
  }
}
