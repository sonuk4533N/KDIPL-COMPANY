import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  StockCountCancelInput,
  StockCountDecisionInput,
  StockCountDraftInput,
} from "@/features/inventory/stock-count-schemas";
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
      "Only an authorized Store Keeper can prepare or post physical counts.",
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
      "Only an authorized Project Director can decide physical counts.",
    );
  }
}

async function lockCount(
  transaction: Prisma.TransactionClient,
  stockCountId: string,
) {
  await transaction.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${stockCountId}::uuid FOR UPDATE`;
  const count = await transaction.stockCount.findUnique({
    where: { id: stockCountId },
    include: {
      location: { select: { isActive: true } },
      lines: {
        include: {
          material: { select: { isActive: true, defaultUnitId: true } },
        },
      },
    },
  });
  if (!count) throw new AppError("NOT_FOUND", "Physical count not found.");
  return count;
}

async function lockBalance(
  transaction: Prisma.TransactionClient,
  locationId: string,
  materialId: string,
  unitId: string,
) {
  await transaction.$queryRaw<Array<{ lockResult: string }>>`
    SELECT pg_advisory_xact_lock(hashtextextended(
      ${locationId}::text || ':' || ${materialId}::text || ':' || ${unitId}::text, 0
    ))::text AS "lockResult"
  `;
  const balances = await transaction.$queryRaw<
    Array<{ quantityOnHand: Prisma.Decimal }>
  >`
    SELECT "quantityOnHand" FROM "InventoryStockBalance"
    WHERE "locationId" = ${locationId}::uuid AND "materialId" = ${materialId}::uuid AND "unitId" = ${unitId}::uuid
  `;
  return balances[0]?.quantityOnHand ?? new Prisma.Decimal(0);
}

export const StockCountService = {
  async createDraft(
    principal: AuthenticatedPrincipal,
    input: StockCountDraftInput,
  ) {
    requirePermission(principal, "inventory.count");
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

      const bookQuantity = await lockBalance(
        transaction,
        location.id,
        material.id,
        input.unitId,
      );
      const countedQuantity = new Prisma.Decimal(input.countedQuantity);
      const varianceQuantity = countedQuantity.minus(bookQuantity);
      const now = new Date();
      const count = await transaction.stockCount.create({
        data: {
          countNumber: await TransactionNumberService.next(
            "CNT",
            now,
            transaction,
          ),
          locationId: location.id,
          countedAt: input.countedAt,
          notes: input.notes,
          createdById: principal.userId,
          lines: {
            create: {
              materialId: material.id,
              unitId: input.unitId,
              bookQuantity,
              countedQuantity,
              varianceQuantity,
              notes: input.lineNotes,
            },
          },
        },
        include: { lines: { select: { id: true } } },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "StockCount",
          entityId: count.id,
          after: {
            countNumber: count.countNumber,
            status: "DRAFT",
            locationId: location.id,
            materialId: material.id,
            unitId: input.unitId,
            bookQuantity: bookQuantity.toString(),
            countedQuantity: countedQuantity.toString(),
            varianceQuantity: varianceQuantity.toString(),
            countedAt: input.countedAt,
          },
        },
        transaction,
      );
      return { id: count.id };
    });
  },

  async submit(principal: AuthenticatedPrincipal, stockCountId: string) {
    requirePermission(principal, "inventory.count");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const count = await lockCount(transaction, stockCountId);
      if (count.status !== "DRAFT")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (
        !count.location.isActive ||
        count.lines.length === 0 ||
        count.lines.some(
          (line) =>
            !line.material.isActive ||
            line.material.defaultUnitId !== line.unitId,
        )
      )
        throw new AppError(
          "CONFLICT",
          "The count location, material, or unit is no longer active.",
        );
      const now = new Date();
      const changed = await transaction.stockCount.updateMany({
        where: { id: count.id, status: "DRAFT" },
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
          entityType: "StockCount",
          entityId: count.id,
          before: { status: "DRAFT" },
          after: { status: "SUBMITTED", submittedAt: now },
        },
        transaction,
      );
      return { id: count.id };
    });
  },

  async decide(
    principal: AuthenticatedPrincipal,
    input: StockCountDecisionInput,
  ) {
    requirePermission(principal, "inventory.count");
    requireProjectDirector(principal);
    return db.$transaction(async (transaction) => {
      const count = await lockCount(transaction, input.stockCountId);
      if (count.status !== "SUBMITTED")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (
        count.createdById === principal.userId ||
        count.submittedById === principal.userId
      )
        throw new AppError(
          "FORBIDDEN",
          "The count creator or submitter cannot approve their own count.",
        );
      const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const now = new Date();
      const changed = await transaction.stockCount.updateMany({
        where: { id: count.id, status: "SUBMITTED" },
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
          entityType: "StockCount",
          entityId: count.id,
          before: { status: "SUBMITTED" },
          after: { status, decidedAt: now, decisionNotes: input.notes },
          reason: input.notes,
        },
        transaction,
      );
      return { id: count.id };
    });
  },

  async post(principal: AuthenticatedPrincipal, stockCountId: string) {
    requirePermission(principal, "inventory.count");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const count = await lockCount(transaction, stockCountId);
      if (count.status === "POSTED")
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This physical count is already posted.",
        );
      if (count.status !== "APPROVED")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (!count.location.isActive)
        throw new AppError(
          "CONFLICT",
          "The count location is no longer active.",
        );

      for (const line of count.lines) {
        if (
          !line.material.isActive ||
          line.material.defaultUnitId !== line.unitId
        )
          throw new AppError(
            "CONFLICT",
            "A counted material or unit is no longer active.",
          );
        const currentQuantity = await lockBalance(
          transaction,
          count.locationId,
          line.materialId,
          line.unitId,
        );
        if (!currentQuantity.equals(line.bookQuantity))
          throw new AppError(
            "CONFLICT",
            "Stock changed after this count was recorded. Cancel it and perform a fresh count.",
          );
      }

      const now = new Date();
      const changed = await transaction.stockCount.updateMany({
        where: { id: count.id, status: "APPROVED" },
        data: { status: "POSTED", postedById: principal.userId, postedAt: now },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      for (const line of count.lines) {
        if (line.varianceQuantity.isZero()) continue;
        await transaction.stockTransaction.create({
          data: {
            transactionNumber: await TransactionNumberService.next(
              "STK",
              now,
              transaction,
            ),
            type: line.varianceQuantity.isPositive()
              ? "ADJUSTMENT_IN"
              : "ADJUSTMENT_OUT",
            locationId: count.locationId,
            materialId: line.materialId,
            unitId: line.unitId,
            quantity: line.varianceQuantity.abs(),
            stockCountLineId: line.id,
            reason: `Physical count variance ${count.countNumber}`,
            createdById: principal.userId,
          },
        });
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.ADJUST,
          entityType: "StockCount",
          entityId: count.id,
          before: { status: "APPROVED" },
          after: {
            status: "POSTED",
            postedAt: now,
            varianceLines: count.lines.filter(
              (line) => !line.varianceQuantity.isZero(),
            ).length,
          },
        },
        transaction,
      );
      return { id: count.id };
    });
  },

  async cancel(
    principal: AuthenticatedPrincipal,
    input: StockCountCancelInput,
  ) {
    requirePermission(principal, "inventory.count");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const count = await lockCount(transaction, input.stockCountId);
      if (count.status !== "DRAFT" && count.status !== "APPROVED")
        throw new AppError("INVALID_STATUS_TRANSITION");
      const now = new Date();
      await transaction.stockCount.update({
        where: { id: count.id },
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
          entityType: "StockCount",
          entityId: count.id,
          before: { status: count.status },
          after: { status: "CANCELLED", cancelledAt: now },
          reason: input.reason,
        },
        transaction,
      );
      return { id: count.id };
    });
  },
};
