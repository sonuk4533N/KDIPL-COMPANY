import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/db/prisma";
import {
  retentionUntilForEightFinancialYears,
  scanFileLocally,
} from "@/server/storage/file-security";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { validateMutationOrigin } from "@/server/auth/request-security";
import { consumeOperationAttempt } from "@/server/auth/rate-limit";
import { AppError } from "@/server/errors/app-error";
import { getStorageProvider, validateUpload } from "@/server/storage/storage";

const text = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let sessionId: string | undefined;
  try {
    await validateMutationOrigin();
    const principal = await getCurrentPrincipal();
    if (!principal)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 51 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Attachment request is too large." },
        { status: 413 },
      );
    }
    await consumeOperationAttempt(`offline-upload:${principal.userId}`, 20);
    const form = await request.formData();
    const file = form.get("file");
    const localDraftId = text(form.get("localDraftId"));
    const checksum = text(form.get("checksum")).toLowerCase();
    const documentType = text(form.get("documentType")).toUpperCase();
    const idempotencyKey = text(form.get("idempotencyKey"));
    if (!(file instanceof File) || !uuid.test(localDraftId)) {
      return NextResponse.json(
        { error: "Invalid attachment request." },
        { status: 400 },
      );
    }
    if (
      !/^[a-f0-9]{64}$/.test(checksum) ||
      idempotencyKey.length < 20 ||
      idempotencyKey.length > 160
    ) {
      return NextResponse.json(
        { error: "Invalid checksum or idempotency key." },
        { status: 400 },
      );
    }
    validateUpload({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      documentType,
    });
    const existing = await db.attachmentUploadSession.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.userId !== principal.userId ||
        existing.localDraftId !== localDraftId ||
        existing.checksum !== checksum
      ) {
        return NextResponse.json(
          { error: "Upload idempotency conflict." },
          { status: 409 },
        );
      }
      return NextResponse.json({
        id: existing.id,
        status: existing.status,
        fileRecordId: existing.fileRecordId,
        duplicate: true,
      });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const actualChecksum = createHash("sha256").update(bytes).digest("hex");
    if (actualChecksum !== checksum) {
      return NextResponse.json(
        { error: "Attachment checksum mismatch." },
        { status: 409 },
      );
    }
    const correlationId = randomUUID();
    const upload = await db.attachmentUploadSession.create({
      data: {
        userId: principal.userId,
        localDraftId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        checksum,
        documentType,
        idempotencyKey,
        status: "UPLOADING",
        correlationId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionId = upload.id;
    const stored = await getStorageProvider().put({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      bytes,
      documentType,
    });
    const scan = scanFileLocally(bytes);
    bytes.fill(0);
    const now = new Date();
    const result = await db.$transaction(async (transaction) => {
      const fileRecord = await transaction.fileRecord.create({
        data: {
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          storageKey: stored.storageKey,
          storageProvider: stored.provider,
          documentType,
          uploadedById: principal.userId,
          scanStatus: scan.status,
          scanProvider: scan.provider,
          scanReference: scan.reference,
          scannedAt: now,
          retentionUntil: retentionUntilForEightFinancialYears(now),
        },
      });
      return transaction.attachmentUploadSession.update({
        where: { id: upload.id },
        data: {
          status: scan.status === "CLEAN" ? "CLEAN" : "QUARANTINED",
          uploadedBytes: file.size,
          fileRecordId: fileRecord.id,
          completedAt: now,
        },
      });
    });
    return NextResponse.json(
      {
        id: result.id,
        status: result.status,
        fileRecordId: result.fileRecordId,
        duplicate: false,
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (sessionId) {
      await db.attachmentUploadSession
        .update({
          where: { id: sessionId },
          data: {
            status: "FAILED",
            retryCount: { increment: 1 },
            failureReason: "UPLOAD_FAILED",
          },
        })
        .catch(() => undefined);
    }
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Attachment upload failed safely." },
      { status: 500 },
    );
  }
}
