import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  MaterialReconciliationCancelInput,
  MaterialReconciliationDraftInput,
} from "@/features/inventory/material-reconciliation-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function requireOperationalRole(principal: AuthenticatedPrincipal) {
  if (
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    (!principal.roleCodes.includes("STORE_KEEPER") &&
      !principal.roleCodes.includes("SITE_SUPERVISOR"))
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only an authorized Store Keeper or Site Supervisor can reconcile issued material.",
    );
  }
}

async function requireIssueScope(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  siteId: string | null,
) {
  requireOperationalRole(principal);
  if (principal.roleCodes.includes("STORE_KEEPER")) return;
  if (!principal.employeeId || !siteId) {
    throw new AppError(
      "FORBIDDEN",
      "Only the issue site's actively assigned supervisor can reconcile this material.",
    );
  }
  const assignment = await transaction.siteAssignment.findFirst({
    where: {
      employeeId: principal.employeeId,
      siteId,
      role: "SITE_SUPERVISOR",
      isActive: true,
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new AppError(
      "FORBIDDEN",
      "Only the issue site's actively assigned supervisor can reconcile this material.",
    );
  }
}

function reconciliationQuantity(value: {
  consumedQuantity: Prisma.Decimal;
  returnedQuantity: Prisma.Decimal;
  wastageQuantity: Prisma.Decimal;
  scrapQuantity: Prisma.Decimal;
}) {
  return value.consumedQuantity
    .add(value.returnedQuantity)
    .add(value.wastageQuantity)
    .add(value.scrapQuantity);
}

async function validateReturnLocation(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  issueSiteId: string | null,
  returnLocationId: string | null | undefined,
  returnedQuantity: Prisma.Decimal,
) {
  if (returnedQuantity.isZero()) return null;
  if (!returnLocationId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Select an active return location for unused material.",
    );
  }
  const location = await transaction.inventoryLocation.findFirst({
    where: { id: returnLocationId, isActive: true },
    select: { id: true, siteId: true },
  });
  if (!location) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Select an active return location for unused material.",
    );
  }
  if (
    !principal.roleCodes.includes("STORE_KEEPER") &&
    location.siteId !== issueSiteId
  ) {
    throw new AppError(
      "FORBIDDEN",
      "A Site Supervisor can return material only to their assigned site's store.",
    );
  }
  return location.id;
}

async function lockReconciliation(
  transaction: Prisma.TransactionClient,
  materialReconciliationId: string,
) {
  await transaction.$queryRaw`
    SELECT "id" FROM "MaterialReconciliation"
    WHERE "id" = ${materialReconciliationId}::uuid
    FOR UPDATE
  `;
  const reconciliation = await transaction.materialReconciliation.findUnique({
    where: { id: materialReconciliationId },
    include: {
      returnLocation: { select: { id: true, isActive: true, siteId: true } },
      materialIssueLine: {
        include: {
          materialIssue: { select: { status: true, siteId: true } },
          material: { select: { isActive: true } },
        },
      },
    },
  });
  if (!reconciliation) {
    throw new AppError("NOT_FOUND", "Material reconciliation not found.");
  }
  return reconciliation;
}

async function postedSummary(
  transaction: Prisma.TransactionClient,
  materialIssueLineId: string,
  excludeId?: string,
) {
  const posted = await transaction.materialReconciliation.findMany({
    where: {
      materialIssueLineId,
      status: "POSTED",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      purpose: true,
      consumedQuantity: true,
      returnedQuantity: true,
      wastageQuantity: true,
      scrapQuantity: true,
    },
  });
  return {
    quantity: posted.reduce(
      (total, item) => total.add(reconciliationQuantity(item)),
      new Prisma.Decimal(0),
    ),
    isFinal: posted.some(({ purpose }) => purpose === "PROJECT_CLOSE"),
  };
}

export const MaterialReconciliationService = {
  async createDraft(
    principal: AuthenticatedPrincipal,
    input: MaterialReconciliationDraftInput,
  ) {
    requirePermission(principal, "inventory.reconcile");
    requireOperationalRole(principal);
    return db.$transaction(async (transaction) => {
      const issueLine = await transaction.materialIssueLine.findUnique({
        where: { id: input.materialIssueLineId },
        include: {
          materialIssue: { select: { status: true, siteId: true } },
          material: { select: { isActive: true } },
        },
      });
      if (!issueLine) {
        throw new AppError("NOT_FOUND", "Issued material line not found.");
      }
      await requireIssueScope(
        transaction,
        principal,
        issueLine.materialIssue.siteId,
      );
      if (issueLine.materialIssue.status !== "ACKNOWLEDGED") {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only acknowledged issued material can be reconciled.",
        );
      }
      if (!issueLine.material.isActive) {
        throw new AppError(
          "CONFLICT",
          "The issued material is no longer active.",
        );
      }

      const quantities = {
        consumedQuantity: new Prisma.Decimal(input.consumedQuantity),
        returnedQuantity: new Prisma.Decimal(input.returnedQuantity),
        wastageQuantity: new Prisma.Decimal(input.wastageQuantity),
        scrapQuantity: new Prisma.Decimal(input.scrapQuantity),
      };
      const amount = reconciliationQuantity(quantities);
      const previous = await postedSummary(transaction, issueLine.id);
      if (previous.isFinal) {
        throw new AppError(
          "CONFLICT",
          "This issued material is already finally reconciled for project close.",
        );
      }
      const remaining = issueLine.quantity.minus(previous.quantity);
      if (amount.gt(remaining)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Reconciliation quantities exceed the remaining issued quantity.",
        );
      }
      if (input.purpose === "PROJECT_CLOSE" && !amount.equals(remaining)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Project-close reconciliation must account for all remaining issued quantity.",
        );
      }
      const returnLocationId = await validateReturnLocation(
        transaction,
        principal,
        issueLine.materialIssue.siteId,
        input.returnLocationId,
        quantities.returnedQuantity,
      );
      const now = new Date();
      const reconciliation = await transaction.materialReconciliation.create({
        data: {
          reconciliationNumber: await TransactionNumberService.next(
            "REC",
            now,
            transaction,
          ),
          materialIssueLineId: issueLine.id,
          returnLocationId,
          purpose: input.purpose,
          ...quantities,
          notes: input.notes,
          createdById: principal.userId,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "MaterialReconciliation",
          entityId: reconciliation.id,
          after: {
            reconciliationNumber: reconciliation.reconciliationNumber,
            status: "DRAFT",
            purpose: input.purpose,
            materialIssueLineId: issueLine.id,
            returnLocationId,
            consumedQuantity: input.consumedQuantity,
            returnedQuantity: input.returnedQuantity,
            wastageQuantity: input.wastageQuantity,
            scrapQuantity: input.scrapQuantity,
            remainingBefore: remaining.toString(),
          },
        },
        transaction,
      );
      return { id: reconciliation.id };
    });
  },

  async post(
    principal: AuthenticatedPrincipal,
    materialReconciliationId: string,
  ) {
    requirePermission(principal, "inventory.reconcile");
    requireOperationalRole(principal);
    return db.$transaction(async (transaction) => {
      const reconciliation = await lockReconciliation(
        transaction,
        materialReconciliationId,
      );
      await requireIssueScope(
        transaction,
        principal,
        reconciliation.materialIssueLine.materialIssue.siteId,
      );
      if (reconciliation.status === "POSTED") {
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This material reconciliation is already posted.",
        );
      }
      if (reconciliation.status !== "DRAFT") {
        throw new AppError("INVALID_STATUS_TRANSITION");
      }
      if (
        reconciliation.materialIssueLine.materialIssue.status !== "ACKNOWLEDGED"
      ) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only acknowledged issued material can be reconciled.",
        );
      }

      await transaction.$queryRaw`
        SELECT "id" FROM "MaterialIssueLine"
        WHERE "id" = ${reconciliation.materialIssueLineId}::uuid
        FOR UPDATE
      `;
      const previous = await postedSummary(
        transaction,
        reconciliation.materialIssueLineId,
        reconciliation.id,
      );
      if (previous.isFinal) {
        throw new AppError(
          "CONFLICT",
          "This issued material is already finally reconciled for project close.",
        );
      }
      const amount = reconciliationQuantity(reconciliation);
      const total = previous.quantity.add(amount);
      const issuedQuantity = reconciliation.materialIssueLine.quantity;
      if (total.gt(issuedQuantity)) {
        throw new AppError(
          "CONFLICT",
          "Reconciliation quantities exceed the issued quantity.",
        );
      }
      if (
        reconciliation.purpose === "PROJECT_CLOSE" &&
        !total.equals(issuedQuantity)
      ) {
        throw new AppError(
          "CONFLICT",
          "Project-close reconciliation must account for all remaining issued quantity.",
        );
      }
      await validateReturnLocation(
        transaction,
        principal,
        reconciliation.materialIssueLine.materialIssue.siteId,
        reconciliation.returnLocationId,
        reconciliation.returnedQuantity,
      );

      const now = new Date();
      const changed = await transaction.materialReconciliation.updateMany({
        where: { id: reconciliation.id, status: "DRAFT" },
        data: { status: "POSTED", postedById: principal.userId, postedAt: now },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      if (!reconciliation.returnedQuantity.isZero()) {
        await transaction.stockTransaction.create({
          data: {
            transactionNumber: await TransactionNumberService.next(
              "STK",
              now,
              transaction,
            ),
            type: "RETURN",
            locationId: reconciliation.returnLocationId!,
            materialId: reconciliation.materialIssueLine.materialId,
            unitId: reconciliation.materialIssueLine.unitId,
            quantity: reconciliation.returnedQuantity,
            reconciliationId: reconciliation.id,
            reason: `Unused issued material return ${reconciliation.reconciliationNumber}`,
            createdById: principal.userId,
          },
        });
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.UPDATE,
          entityType: "MaterialReconciliation",
          entityId: reconciliation.id,
          before: { status: "DRAFT" },
          after: {
            status: "POSTED",
            postedAt: now,
            purpose: reconciliation.purpose,
            returnedToLedger: reconciliation.returnedQuantity.toString(),
            remainingAfter: issuedQuantity.minus(total).toString(),
          },
        },
        transaction,
      );
      return { id: reconciliation.id };
    });
  },

  async cancelDraft(
    principal: AuthenticatedPrincipal,
    input: MaterialReconciliationCancelInput,
  ) {
    requirePermission(principal, "inventory.reconcile");
    requireOperationalRole(principal);
    return db.$transaction(async (transaction) => {
      const reconciliation = await lockReconciliation(
        transaction,
        input.materialReconciliationId,
      );
      await requireIssueScope(
        transaction,
        principal,
        reconciliation.materialIssueLine.materialIssue.siteId,
      );
      if (reconciliation.status !== "DRAFT") {
        throw new AppError("INVALID_STATUS_TRANSITION");
      }
      const now = new Date();
      await transaction.materialReconciliation.update({
        where: { id: reconciliation.id },
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
          entityType: "MaterialReconciliation",
          entityId: reconciliation.id,
          before: { status: "DRAFT" },
          after: { status: "CANCELLED", cancelledAt: now },
          reason: input.reason,
        },
        transaction,
      );
      return { id: reconciliation.id };
    });
  },
};
