import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  AuditAction,
  RequestForQuotationStatus,
} from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import {
  rfqDateInput,
  type RfqDraftInput,
} from "@/features/procurement/rfq-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function procurementRequirementScope(
  principal: AuthenticatedPrincipal,
): Prisma.MaterialRequirementWhereInput {
  if (
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    principal.roleCodes.includes("PURCHASE_MANAGER")
  ) {
    return {};
  }
  if (!principal.employeeId) {
    return { id: { equals: "00000000-0000-0000-0000-000000000000" } };
  }
  return {
    OR: [
      {
        project: {
          assignments: {
            some: { employeeId: principal.employeeId, isActive: true },
          },
        },
      },
      {
        site: {
          assignments: {
            some: { employeeId: principal.employeeId, isActive: true },
          },
        },
      },
    ],
  };
}

function supplierEvidence(
  suppliers: Array<{ supplierId: string; isActive: boolean }>,
) {
  return suppliers.map(({ supplierId, isActive }) => ({
    supplierId,
    isActive,
  }));
}

export const RfqService = {
  async saveDraft(principal: AuthenticatedPrincipal, input: RfqDraftInput) {
    requirePermission(principal, "purchase.create");
    return db.$transaction(async (transaction) => {
      const before = input.rfqId
        ? await transaction.requestForQuotation.findFirst({
            where: {
              id: input.rfqId,
              requirement: procurementRequirementScope(principal),
            },
            include: { invitedSuppliers: true },
          })
        : null;
      if (input.rfqId && !before) throw new AppError("NOT_FOUND");
      if (before && before.status !== RequestForQuotationStatus.DRAFT) {
        throw new AppError("CONFLICT", "Only draft RFQs can be changed.");
      }
      if (before && before.createdById !== principal.userId) {
        throw new AppError(
          "FORBIDDEN",
          "Only the RFQ creator can change this draft.",
        );
      }
      if (before && before.requirementId !== input.requirementId) {
        throw new AppError(
          "CONFLICT",
          "An RFQ cannot be moved to another material requirement.",
        );
      }

      const requirement = await transaction.materialRequirement.findFirst({
        where: {
          id: input.requirementId,
          status: "APPROVED",
          AND: procurementRequirementScope(principal),
        },
        include: {
          lines: {
            where: { isActive: true },
            orderBy: { position: "asc" },
            select: {
              materialId: true,
              unitId: true,
              quantity: true,
            },
          },
        },
      });
      if (!requirement) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an approved material requirement within your sourcing scope.",
        );
      }
      if (!requirement.lines.length) {
        throw new AppError(
          "CONFLICT",
          "The approved requirement has no active material lines.",
        );
      }

      const existingSupplierIds = new Set(
        before?.invitedSuppliers.map(({ supplierId }) => supplierId) ?? [],
      );
      const suppliers = await transaction.supplier.findMany({
        where: { id: { in: input.supplierIds } },
        select: { id: true, legalName: true, isActive: true },
      });
      if (suppliers.length !== input.supplierIds.length) {
        throw new AppError("VALIDATION_ERROR", "Select valid suppliers.");
      }
      const newlyInactive = suppliers.find(
        ({ id, isActive }) => !isActive && !existingSupplierIds.has(id),
      );
      if (newlyInactive) {
        throw new AppError(
          "VALIDATION_ERROR",
          `${newlyInactive.legalName} is inactive and cannot be added.`,
        );
      }

      const responseDueDate = rfqDateInput(input.responseDueDate);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (responseDueDate < today) {
        throw new AppError(
          "VALIDATION_ERROR",
          "The response due date cannot be in the past.",
          400,
          { responseDueDate: ["Choose today or a future date."] },
        );
      }

      const now = new Date();
      const rfq = before
        ? await transaction.requestForQuotation.update({
            where: { id: before.id },
            data: { responseDueDate, notes: input.notes },
          })
        : await transaction.requestForQuotation.create({
            data: {
              rfqNumber: await TransactionNumberService.next(
                "RFQ",
                now,
                transaction,
              ),
              requirementId: requirement.id,
              responseDueDate,
              notes: input.notes,
              createdById: principal.userId,
            },
          });

      await transaction.requestForQuotationSupplier.updateMany({
        where: {
          rfqId: rfq.id,
          supplierId: { notIn: input.supplierIds },
          isActive: true,
        },
        data: { isActive: false },
      });
      for (const supplierId of input.supplierIds) {
        await transaction.requestForQuotationSupplier.upsert({
          where: { rfqId_supplierId: { rfqId: rfq.id, supplierId } },
          create: { rfqId: rfq.id, supplierId },
          update: { isActive: true },
        });
      }
      const afterSuppliers =
        await transaction.requestForQuotationSupplier.findMany({
          where: { rfqId: rfq.id },
          orderBy: { supplierId: "asc" },
          select: { supplierId: true, isActive: true },
        });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "RequestForQuotation",
          entityId: rfq.id,
          before: before
            ? {
                requirementId: before.requirementId,
                status: before.status,
                responseDueDate: before.responseDueDate,
                notes: before.notes,
                suppliers: supplierEvidence(before.invitedSuppliers),
              }
            : undefined,
          after: {
            rfqNumber: rfq.rfqNumber,
            requirementId: rfq.requirementId,
            status: rfq.status,
            responseDueDate: rfq.responseDueDate,
            notes: rfq.notes,
            requirementLines: requirement.lines.map((line) => ({
              materialId: line.materialId,
              unitId: line.unitId,
              quantity: line.quantity.toString(),
            })),
            suppliers: supplierEvidence(afterSuppliers),
          },
        },
        transaction,
      );
      return { id: rfq.id };
    });
  },
};
