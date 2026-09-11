import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  StockAdjustmentCancelInput,
  StockAdjustmentDecisionInput,
  StockAdjustmentDraftInput,
} from "@/features/inventory/stock-adjustment-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function requireStoreKeeper(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("STORE_KEEPER") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only an authorized Store Keeper can prepare or post stock adjustments.",
    );
  }
}

function requireProjectDirector(principal: AuthenticatedPrincipal) {
  if (
    !principal.roleCodes.includes("PROJECT_DIRECTOR") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only an authorized Project Director can decide stock adjustments.",
    );
  }
}

async function lockAdjustment(
  transaction: Prisma.TransactionClient,
  stockAdjustmentId: string,
) {
  await transaction.$queryRaw`
    SELECT "id" FROM "StockAdjustment"
    WHERE "id" = ${stockAdjustmentId}::uuid
    FOR UPDATE
  `;
  const adjustment = await transaction.stockAdjustment.findUnique({
    where: { id: stockAdjustmentId },
    include: {
      location: { select: { isActive: true } },
      material: { select: { isActive: true, defaultUnitId: true } },
    },
  });
  if (!adjustment)
    throw new AppError("NOT_FOUND", "Stock adjustment not found.");
  return adjustment;
}

export const StockAdjustmentService = {
  async createDraft(
    principal: AuthenticatedPrincipal,
    input: StockAdjustmentDraftInput,
  ) {
    requirePermission(principal, "inventory.adjust");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const [location, material] = await Promise.all([
        transaction.inventoryLocation.findFirst({
          where: { id: input.locationId, isActive: true },
          select: { id: true },
        }),
        transaction.material.findFirst({
          where: { id: input.materialId, isActive: true },
          select: { id: true, defaultUnitId: true },
        }),
      ]);
      if (!location)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active inventory location.",
        );
      if (!material || material.defaultUnitId !== input.unitId)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active material with its configured unit.",
        );

      const now = new Date();
      const adjustment = await transaction.stockAdjustment.create({
        data: {
          adjustmentNumber: await TransactionNumberService.next(
            "ADJ",
            now,
            transaction,
          ),
          locationId: location.id,
          materialId: material.id,
          unitId: input.unitId,
          direction: input.direction,
          quantity: new Prisma.Decimal(input.quantity),
          reason: input.reason,
          createdById: principal.userId,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          after: {
            adjustmentNumber: adjustment.adjustmentNumber,
            status: "DRAFT",
            locationId: location.id,
            materialId: material.id,
            unitId: input.unitId,
            direction: input.direction,
            quantity: input.quantity,
            reason: input.reason,
          },
        },
        transaction,
      );
      return { id: adjustment.id };
    });
  },

  async submit(principal: AuthenticatedPrincipal, stockAdjustmentId: string) {
    requirePermission(principal, "inventory.adjust");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const adjustment = await lockAdjustment(transaction, stockAdjustmentId);
      if (adjustment.status !== "DRAFT")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (!adjustment.location.isActive || !adjustment.material.isActive)
        throw new AppError(
          "CONFLICT",
          "The adjustment location or material is no longer active.",
        );
      const now = new Date();
      const changed = await transaction.stockAdjustment.updateMany({
        where: { id: adjustment.id, status: "DRAFT" },
        data: {
          status: "SUBMITTED",
          submittedById: principal.userId,
          submittedAt: now,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.SUBMIT,
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          before: { status: "DRAFT" },
          after: { status: "SUBMITTED", submittedAt: now },
        },
        transaction,
      );
      return { id: adjustment.id };
    });
  },

  async decide(
    principal: AuthenticatedPrincipal,
    input: StockAdjustmentDecisionInput,
  ) {
    requirePermission(principal, "inventory.adjust");
    requireProjectDirector(principal);
    return db.$transaction(async (transaction) => {
      const adjustment = await lockAdjustment(
        transaction,
        input.stockAdjustmentId,
      );
      if (adjustment.status !== "SUBMITTED")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (
        adjustment.createdById === principal.userId ||
        adjustment.submittedById === principal.userId
      ) {
        throw new AppError(
          "FORBIDDEN",
          "The adjustment creator or submitter cannot approve their own adjustment.",
        );
      }
      const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const now = new Date();
      const changed = await transaction.stockAdjustment.updateMany({
        where: { id: adjustment.id, status: "SUBMITTED" },
        data: {
          status,
          decidedById: principal.userId,
          decidedAt: now,
          decisionNotes: input.notes,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action:
            input.decision === "APPROVE"
              ? AuditAction.APPROVE
              : AuditAction.REJECT,
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          before: { status: "SUBMITTED" },
          after: { status, decidedAt: now, decisionNotes: input.notes },
          reason: input.notes,
        },
        transaction,
      );
      return { id: adjustment.id };
    });
  },

  async post(principal: AuthenticatedPrincipal, stockAdjustmentId: string) {
    requirePermission(principal, "inventory.adjust");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const adjustment = await lockAdjustment(transaction, stockAdjustmentId);
      if (adjustment.status === "POSTED") {
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This stock adjustment is already posted.",
        );
      }
      if (adjustment.status !== "APPROVED")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (!adjustment.location.isActive || !adjustment.material.isActive)
        throw new AppError(
          "CONFLICT",
          "The adjustment location or material is no longer active.",
        );

      if (adjustment.direction === "OUT") {
        await transaction.$queryRaw<Array<{ lockResult: string }>>`
          SELECT pg_advisory_xact_lock(hashtextextended(
            ${adjustment.locationId}::text || ':' || ${adjustment.materialId}::text || ':' || ${adjustment.unitId}::text,
            0
          ))::text AS "lockResult"
        `;
        const balances = await transaction.$queryRaw<
          Array<{ quantityOnHand: Prisma.Decimal }>
        >`
          SELECT "quantityOnHand"
          FROM "InventoryStockBalance"
          WHERE "locationId" = ${adjustment.locationId}::uuid
            AND "materialId" = ${adjustment.materialId}::uuid
            AND "unitId" = ${adjustment.unitId}::uuid
        `;
        const available = balances[0]?.quantityOnHand ?? new Prisma.Decimal(0);
        if (available.lt(adjustment.quantity)) {
          throw new AppError(
            "INSUFFICIENT_STOCK",
            "There is not enough available stock to post this adjustment.",
          );
        }
      }

      const now = new Date();
      const changed = await transaction.stockAdjustment.updateMany({
        where: { id: adjustment.id, status: "APPROVED" },
        data: {
          status: "POSTED",
          postedById: principal.userId,
          postedAt: now,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await transaction.stockTransaction.create({
        data: {
          transactionNumber: await TransactionNumberService.next(
            "STK",
            now,
            transaction,
          ),
          type:
            adjustment.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          locationId: adjustment.locationId,
          materialId: adjustment.materialId,
          unitId: adjustment.unitId,
          quantity: adjustment.quantity,
          stockAdjustmentId: adjustment.id,
          reason: adjustment.reason,
          createdById: principal.userId,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.ADJUST,
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          before: { status: "APPROVED" },
          after: {
            status: "POSTED",
            postedAt: now,
            movement: `ADJUSTMENT_${adjustment.direction}`,
          },
        },
        transaction,
      );
      return { id: adjustment.id };
    });
  },

  async cancel(
    principal: AuthenticatedPrincipal,
    input: StockAdjustmentCancelInput,
  ) {
    requirePermission(principal, "inventory.adjust");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const adjustment = await lockAdjustment(
        transaction,
        input.stockAdjustmentId,
      );
      if (adjustment.status !== "DRAFT" && adjustment.status !== "APPROVED")
        throw new AppError("INVALID_STATUS_TRANSITION");
      const now = new Date();
      await transaction.stockAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: "CANCELLED",
          cancelledById: principal.userId,
          cancelledAt: now,
          cancellationReason: input.reason,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CANCEL,
          entityType: "StockAdjustment",
          entityId: adjustment.id,
          before: { status: adjustment.status },
          after: { status: "CANCELLED", cancelledAt: now },
          reason: input.reason,
        },
        transaction,
      );
      return { id: adjustment.id };
    });
  },
};
