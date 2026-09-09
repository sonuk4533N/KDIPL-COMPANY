import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import type {
  MaterialIssueCancelInput,
  MaterialIssueDraftInput,
} from "@/features/inventory/material-issue-schemas";
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
      "Only an authorized Store Keeper can create, post, or cancel material issues.",
    );
  }
}

async function requireAssignedSiteSupervisor(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  siteId: string,
) {
  if (
    !principal.roleCodes.includes("SITE_SUPERVISOR") ||
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    !principal.employeeId
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Only the actively assigned Site Supervisor can acknowledge this issue.",
    );
  }
  const assignment = await transaction.siteAssignment.findFirst({
    where: {
      siteId,
      employeeId: principal.employeeId,
      role: "SITE_SUPERVISOR",
      isActive: true,
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new AppError(
      "FORBIDDEN",
      "Only the actively assigned Site Supervisor can acknowledge this issue.",
    );
  }
}

export const MaterialIssueService = {
  async createDraft(
    principal: AuthenticatedPrincipal,
    input: MaterialIssueDraftInput,
  ) {
    requirePermission(principal, "inventory.issue");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      const [sourceLocation, destinationSite, material] = await Promise.all([
        transaction.inventoryLocation.findFirst({
          where: { id: input.sourceLocationId, isActive: true },
          select: { id: true },
        }),
        transaction.site.findFirst({
          where: {
            id: input.siteId,
            status: "ACTIVE",
            project: { status: "ACTIVE" },
          },
          select: { id: true, projectId: true },
        }),
        transaction.material.findFirst({
          where: { id: input.materialId, isActive: true },
          select: { id: true, defaultUnitId: true },
        }),
      ]);
      if (!sourceLocation)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active source location.",
        );
      if (!destinationSite)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active destination site.",
        );
      if (!material || material.defaultUnitId !== input.unitId)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an active material with its configured unit.",
        );

      const now = new Date();
      const issue = await transaction.materialIssue.create({
        data: {
          issueNumber: await TransactionNumberService.next(
            "MI",
            now,
            transaction,
          ),
          sourceLocationId: sourceLocation.id,
          projectId: destinationSite.projectId,
          siteId: destinationSite.id,
          purpose: input.purpose,
          notes: input.notes,
          createdById: principal.userId,
          lines: {
            create: {
              materialId: material.id,
              unitId: input.unitId,
              quantity: new Prisma.Decimal(input.quantity),
            },
          },
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.CREATE,
          entityType: "MaterialIssue",
          entityId: issue.id,
          after: {
            issueNumber: issue.issueNumber,
            status: "DRAFT",
            sourceLocationId: issue.sourceLocationId,
            projectId: issue.projectId,
            siteId: issue.siteId,
            materialId: material.id,
            unitId: input.unitId,
            quantity: input.quantity,
          },
        },
        transaction,
      );
      return { id: issue.id };
    });
  },

  async post(principal: AuthenticatedPrincipal, materialIssueId: string) {
    requirePermission(principal, "inventory.issue");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "MaterialIssue"
        WHERE "id" = ${materialIssueId}::uuid
        FOR UPDATE
      `;
      const issue = await transaction.materialIssue.findUnique({
        where: { id: materialIssueId },
        include: {
          lines: true,
          sourceLocation: { select: { isActive: true } },
        },
      });
      if (!issue) throw new AppError("NOT_FOUND", "Material issue not found.");
      if (issue.status === "POSTED" || issue.status === "ACKNOWLEDGED") {
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This material issue is already posted.",
        );
      }
      if (issue.status !== "DRAFT")
        throw new AppError("INVALID_STATUS_TRANSITION");
      if (!issue.sourceLocation.isActive)
        throw new AppError(
          "CONFLICT",
          "The source location is no longer active.",
        );
      if (!issue.lines.length)
        throw new AppError(
          "VALIDATION_ERROR",
          "Add at least one material issue line.",
        );

      const sortedLines = [...issue.lines].sort((left, right) =>
        `${left.materialId}:${left.unitId}`.localeCompare(
          `${right.materialId}:${right.unitId}`,
        ),
      );
      for (const line of sortedLines) {
        await transaction.$queryRaw<Array<{ lockResult: string }>>`
          SELECT pg_advisory_xact_lock(hashtextextended(
            ${issue.sourceLocationId}::text || ':' || ${line.materialId}::text || ':' || ${line.unitId}::text,
            0
          ))::text AS "lockResult"
        `;
        const balances = await transaction.$queryRaw<
          Array<{ quantityOnHand: Prisma.Decimal }>
        >`
          SELECT "quantityOnHand"
          FROM "InventoryStockBalance"
          WHERE "locationId" = ${issue.sourceLocationId}::uuid
            AND "materialId" = ${line.materialId}::uuid
            AND "unitId" = ${line.unitId}::uuid
        `;
        const available = balances[0]?.quantityOnHand ?? new Prisma.Decimal(0);
        if (available.lt(line.quantity)) {
          throw new AppError(
            "INSUFFICIENT_STOCK",
            "There is not enough available stock to post this material issue.",
          );
        }
      }

      const now = new Date();
      const changed = await transaction.materialIssue.updateMany({
        where: { id: issue.id, status: "DRAFT" },
        data: { status: "POSTED", postedById: principal.userId, postedAt: now },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");

      for (const line of sortedLines) {
        await transaction.stockTransaction.create({
          data: {
            transactionNumber: await TransactionNumberService.next(
              "STK",
              now,
              transaction,
            ),
            type: "ISSUE",
            locationId: issue.sourceLocationId,
            materialId: line.materialId,
            unitId: line.unitId,
            quantity: line.quantity,
            materialIssueLineId: line.id,
            createdById: principal.userId,
          },
        });
      }
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.ISSUE,
          entityType: "MaterialIssue",
          entityId: issue.id,
          before: { status: "DRAFT" },
          after: {
            status: "POSTED",
            postedAt: now,
            stockLineCount: sortedLines.length,
          },
        },
        transaction,
      );
      return { id: issue.id };
    });
  },

  async acknowledge(
    principal: AuthenticatedPrincipal,
    materialIssueId: string,
  ) {
    requirePermission(principal, "inventory.issue");
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "MaterialIssue"
        WHERE "id" = ${materialIssueId}::uuid
        FOR UPDATE
      `;
      const issue = await transaction.materialIssue.findUnique({
        where: { id: materialIssueId },
        select: { id: true, issueNumber: true, siteId: true, status: true },
      });
      if (!issue) throw new AppError("NOT_FOUND", "Material issue not found.");
      if (!issue.siteId)
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "This issue has no destination site to acknowledge.",
        );
      await requireAssignedSiteSupervisor(transaction, principal, issue.siteId);
      if (issue.status === "ACKNOWLEDGED") {
        throw new AppError(
          "DUPLICATE_TRANSACTION",
          "This material issue is already acknowledged.",
        );
      }
      if (issue.status !== "POSTED")
        throw new AppError("INVALID_STATUS_TRANSITION");

      const now = new Date();
      const changed = await transaction.materialIssue.updateMany({
        where: { id: issue.id, status: "POSTED" },
        data: {
          status: "ACKNOWLEDGED",
          acknowledgedById: principal.userId,
          acknowledgedAt: now,
        },
      });
      if (changed.count !== 1) throw new AppError("CONFLICT");
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.RECEIVE,
          entityType: "MaterialIssue",
          entityId: issue.id,
          before: { status: "POSTED" },
          after: { status: "ACKNOWLEDGED", acknowledgedAt: now },
          metadata: { evidence: "SITE_SUPERVISOR_ACKNOWLEDGMENT" },
        },
        transaction,
      );
      return { id: issue.id };
    });
  },

  async cancelDraft(
    principal: AuthenticatedPrincipal,
    input: MaterialIssueCancelInput,
  ) {
    requirePermission(principal, "inventory.issue");
    requireStoreKeeper(principal);
    return db.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "MaterialIssue"
        WHERE "id" = ${input.materialIssueId}::uuid
        FOR UPDATE
      `;
      const issue = await transaction.materialIssue.findUnique({
        where: { id: input.materialIssueId },
        select: { id: true, status: true },
      });
      if (!issue) throw new AppError("NOT_FOUND", "Material issue not found.");
      if (issue.status !== "DRAFT")
        throw new AppError("INVALID_STATUS_TRANSITION");

      const now = new Date();
      await transaction.materialIssue.update({
        where: { id: issue.id },
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
          entityType: "MaterialIssue",
          entityId: issue.id,
          before: { status: "DRAFT" },
          after: { status: "CANCELLED", cancelledAt: now },
          reason: input.reason,
        },
        transaction,
      );
      return { id: issue.id };
    });
  },
};
