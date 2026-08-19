import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/config/env";
import { AppError } from "@/server/errors/app-error";

const allowedTypes = new Map([
  ["application/pdf", new Set([".pdf"])],
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/webp", new Set([".webp"])],
]);

export interface StorageUpload {
  filename: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
  documentType: string;
}

export interface StoredObject {
  storageKey: string;
  provider: "LOCAL" | "S3";
}

export interface FileStorageProvider {
  put(upload: StorageUpload): Promise<StoredObject>;
  getAuthorizedUrl(
    storageKey: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  delete(storageKey: string): Promise<void>;
}

export function validateUpload(upload: Omit<StorageUpload, "bytes">): void {
  const extension = path.extname(upload.filename).toLowerCase();
  const extensions = allowedTypes.get(upload.mimeType);
  if (!extensions?.has(extension))
    throw new AppError("FILE_UPLOAD_ERROR", "Unsupported file type.");
  if (
    !Number.isSafeInteger(upload.size) ||
    upload.size <= 0 ||
    upload.size > env.FILE_STORAGE_MAX_BYTES
  ) {
    throw new AppError(
      "FILE_UPLOAD_ERROR",
      "The file exceeds the allowed size.",
    );
  }
}

function createStorageKey(upload: StorageUpload) {
  const extension = path.extname(upload.filename).toLowerCase();
  return `${upload.documentType.toLowerCase()}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
}

class LocalStorageProvider implements FileStorageProvider {
  private readonly root = path.resolve(env.FILE_STORAGE_LOCAL_PATH);

  private resolveKey(storageKey: string) {
    const target = path.resolve(this.root, storageKey);
    if (!target.startsWith(`${this.root}${path.sep}`))
      throw new AppError("FORBIDDEN");
    return target;
  }

  async put(upload: StorageUpload): Promise<StoredObject> {
    validateUpload(upload);
    const storageKey = createStorageKey(upload);
    const target = this.resolveKey(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, upload.bytes, { flag: "wx" });
    return { storageKey, provider: "LOCAL" };
  }

  async getAuthorizedUrl(
    storageKey: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    this.resolveKey(storageKey);
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = createHmac("sha256", env.AUTH_SECRET)
      .update(`${storageKey}:${expires}`)
      .digest("hex");
    return `/api/files/${encodeURIComponent(storageKey)}?expires=${expires}&signature=${signature}`;
  }

  async delete(storageKey: string): Promise<void> {
    await unlink(this.resolveKey(storageKey)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
  }
}

class S3StorageProvider implements FileStorageProvider {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    if (!env.FILE_STORAGE_BUCKET || !env.FILE_STORAGE_REGION) {
      throw new Error(
        "S3 storage requires FILE_STORAGE_BUCKET and FILE_STORAGE_REGION",
      );
    }
    this.bucket = env.FILE_STORAGE_BUCKET;
    this.client = new S3Client({
      region: env.FILE_STORAGE_REGION,
      endpoint: env.FILE_STORAGE_ENDPOINT,
      forcePathStyle: env.FILE_STORAGE_FORCE_PATH_STYLE,
      credentials:
        env.FILE_STORAGE_ACCESS_KEY_ID && env.FILE_STORAGE_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.FILE_STORAGE_ACCESS_KEY_ID,
              secretAccessKey: env.FILE_STORAGE_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async put(upload: StorageUpload): Promise<StoredObject> {
    validateUpload(upload);
    const storageKey = createStorageKey(upload);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: upload.bytes,
        ContentType: upload.mimeType,
      }),
    );
    return { storageKey, provider: "S3" };
  }

  getAuthorizedUrl(
    storageKey: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      {
        expiresIn: expiresInSeconds,
      },
    );
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }
}

let storageProvider: FileStorageProvider | undefined;

export function getStorageProvider(): FileStorageProvider {
  storageProvider ??=
    env.FILE_STORAGE_PROVIDER === "s3"
      ? new S3StorageProvider()
      : new LocalStorageProvider();
  return storageProvider;
}
