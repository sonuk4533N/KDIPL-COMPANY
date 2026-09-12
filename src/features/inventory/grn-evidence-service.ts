import "server-only";

import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type { GoodsReceiptDocumentTypeInput } from "@/features/inventory/grn-evidence-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import {
  retentionUntilForEightFinancialYears,
  scanFileLocally,
} from "@/server/storage/file-security";
import { getStorageProvider, validateUpload } from "@/server/storage/storage";
import type { AuthenticatedPrincipal } from "@/types/application";

function requirePurchaseManager(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("PURCHASE_MANAGER") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only the Purchase Manager can attach GRN evidence.",
    );
  }
}

function requireSiteSupervisor(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("SITE_SUPERVISOR") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only the assigned Site Supervisor can acknowledge direct-site receipt.",
    );
  }
}

export const GrnEvidenceService = {
  async attach(
    principal: AuthenticatedPrincipal,
    input: {
      goodsReceiptId: string;
      documentType: GoodsReceiptDocumentTypeInput;
      file: File;
    },
  ) {
    requirePermission(principal, "purchase.create");
    requirePurchaseManager(principal);
    const receipt = await db.goodsReceipt.findUnique({
      where: { id: input.goodsReceiptId },
      select: {
        id: true,
        status: true,
        directSiteDelivery: true,
        createdById: true,
      },
    });
    if (!receipt) throw new AppError("NOT_FOUND", "GRN not found.");
    if (receipt.status !== "DRAFT") {
      throw new AppError(
        "INVALID_STATUS_TRANSITION",
        "Evidence can be attached only while the GRN is draft.",
      );
    }
    if (!receipt.directSiteDelivery) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Mandatory evidence applies to a direct-site GRN.",
      );
    }

    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const upload = {
      filename: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      size: input.file.size,
      bytes,
      documentType: `GRN_${input.documentType}`,
    };
    validateUpload(upload);
    const storage = getStorageProvider();
    const stored = await storage.put(upload);
    const now = new Date();

    let record: { id: string };
    try {
      record = await db.$transaction(async (transaction) => {
        const fileRecord = await transaction.fileRecord.create({
          data: {
            filename: upload.filename,
            mimeType: upload.mimeType,
            size: BigInt(upload.size),
            storageKey: stored.storageKey,
            storageProvider: stored.provider,
            documentType: upload.documentType,
            uploadedById: principal.userId,
            scanStatus: "QUARANTINED",
            retentionUntil: retentionUntilForEightFinancialYears(now),
          },
          select: { id: true },
        });
        await transaction.goodsReceiptDocument.create({
          data: {
            goodsReceiptId: receipt.id,
            fileRecordId: fileRecord.id,
            type: input.documentType,
          },
        });
        return fileRecord;
      });
    } catch (error) {
      await storage.delete(stored.storageKey);
      throw error;
    }

    const scan = scanFileLocally(bytes);
    await db.$transaction(async (transaction) => {
      await transaction.fileRecord.update({
        where: { id: record.id },
        data: {
          scanStatus: scan.status,
          scanProvider: scan.provider,
          scanReference: scan.reference,
          scannedAt: new Date(),
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action:
            scan.status === "CLEAN" ? AuditAction.CREATE : AuditAction.REJECT,
          entityType: "GoodsReceiptDocument",
          entityId: record.id,
          reason:
            scan.status === "REJECTED"
              ? "Evidence rejected by local security scan."
              : undefined,
          after: {
            goodsReceiptId: receipt.id,
            documentType: input.documentType,
            scanStatus: scan.status,
          },
        },
        transaction,
      );
    });
    if (scan.status !== "CLEAN") {
      throw new AppError(
        "FILE_UPLOAD_ERROR",
        "The attachment was quarantined because its security scan failed.",
      );
    }
    return { id: record.id };
  },

  async acknowledgeSiteReceipt(
    principal: AuthenticatedPrincipal,
    goodsReceiptId: string,
  ) {
    requirePermission(principal, "inventory.receive");
    requireSiteSupervisor(principal);
    const employeeId = principal.employeeId;
    if (!employeeId) throw new AppError("FORBIDDEN");

    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "GoodsReceipt"
        WHERE "id" = ${goodsReceiptId}::uuid
        FOR UPDATE
      `;
      const receipt = await transaction.goodsReceipt.findUnique({
        where: { id: goodsReceiptId },
        include: {
          location: { select: { type: true, siteId: true } },
          purchaseOrder: {
            select: {
              rfq: {
                select: {
                  requirement: { select: { siteId: true } },
                },
              },
            },
          },
        },
      });
      if (!receipt) throw new AppError("NOT_FOUND", "GRN not found.");
      if (
        receipt.status !== "PENDING_PM_APPROVAL" ||
        !receipt.directSiteDelivery ||
        receipt.location.type !== "SITE_STORE"
      ) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a verified direct-site GRN can be acknowledged.",
        );
      }
      const siteId = receipt.purchaseOrder.rfq.requirement.siteId;
      if (!siteId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Direct-site receipt requires a project site.",
        );
      }
      const now = new Date();
      const assignment = await transaction.siteAssignment.findFirst({
        where: {
          siteId,
          employeeId,
          role: "SITE_SUPERVISOR",
          isActive: true,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new AppError(
          "FORBIDDEN",
          "You are not the active Site Supervisor for this receipt site.",
        );
      }
      if (
        receipt.createdById === principal.userId ||
        receipt.verifiedById === principal.userId
      ) {
        throw new AppError(
          "FORBIDDEN",
          "The GRN creator or Store Keeper verifier cannot acknowledge site receipt.",
        );
      }

      const changed = await transaction.goodsReceipt.updateMany({
        where: {
          id: goodsReceiptId,
          status: "PENDING_PM_APPROVAL",
          siteAcknowledgedAt: null,
        },
        data: {
          siteAcknowledgedById: principal.userId,
          siteAcknowledgedAt: now,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.VERIFY,
          entityType: "GoodsReceipt",
          entityId: goodsReceiptId,
          before: { siteAcknowledgedAt: null },
          after: { siteAcknowledgedAt: now },
        },
        transaction,
      );
      return { id: goodsReceiptId };
    });
  },
};
