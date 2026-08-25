import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  AuditAction,
  MaterialRequirementStatus,
} from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import {
  requirementDateInput,
  type RequirementDraftInput,
} from "@/features/requirements/requirement-schemas";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function requirementScope(
  principal: AuthenticatedPrincipal,
): Prisma.MaterialRequirementWhereInput {
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return {};
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

async function ensureSiteScope(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  projectId: string,
  siteId: string,
) {
  const site = await transaction.site.findFirst({
    where: {
      id: siteId,
      projectId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      project: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      ...(principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
        ? {}
        : principal.employeeId
          ? {
              OR: [
                {
                  assignments: {
                    some: {
                      employeeId: principal.employeeId,
                      isActive: true,
                    },
                  },
                },
                {
                  project: {
                    assignments: {
                      some: {
                        employeeId: principal.employeeId,
                        isActive: true,
                      },
                    },
                  },
                },
              ],
            }
          : { id: "00000000-0000-0000-0000-000000000000" }),
    },
    select: { id: true },
  });
  if (!site) {
    throw new AppError(
      "FORBIDDEN",
      "Select an open site within your assignment scope.",
    );
  }
}

function lineEvidence(
  lines: Array<{
    materialId: string;
    unitId: string;
    quantity: unknown;
    position: number;
    isActive: boolean;
  }>,
) {
  return lines.map((line) => ({
    materialId: line.materialId,
    unitId: line.unitId,
    quantity: String(line.quantity),
    position: line.position,
    isActive: line.isActive,
  }));
}

export const RequirementService = {
  async saveDraft(
    principal: AuthenticatedPrincipal,
    input: RequirementDraftInput,
  ) {
    requirePermission(principal, "material_requirement.create");
    return db.$transaction(async (transaction) => {
      const before = input.requirementId
        ? await transaction.materialRequirement.findFirst({
            where: {
              id: input.requirementId,
              AND: requirementScope(principal),
            },
            include: { lines: { orderBy: { position: "asc" } } },
          })
        : null;
      if (input.requirementId && !before) throw new AppError("NOT_FOUND");
      if (before && before.status !== MaterialRequirementStatus.DRAFT) {
        throw new AppError(
          "CONFLICT",
          "Only draft requirements can be changed.",
        );
      }
      if (before && before.createdById !== principal.userId) {
        throw new AppError(
          "FORBIDDEN",
          "Only the draft creator can change this requirement.",
        );
      }

      await ensureSiteScope(
        transaction,
        principal,
        input.projectId,
        input.siteId,
      );

      const existingMaterialIds = new Set(
        before?.lines.map((line) => line.materialId) ?? [],
      );
      const materials = await transaction.material.findMany({
        where: { id: { in: input.lines.map((line) => line.materialId) } },
        select: {
          id: true,
          name: true,
          defaultUnitId: true,
          defaultUnit: { select: { decimalScale: true } },
          isActive: true,
        },
      });
      if (materials.length !== input.lines.length) {
        throw new AppError("VALIDATION_ERROR", "Select valid materials.");
      }
      if (
        materials.some(
          (material) =>
            !material.isActive && !existingMaterialIds.has(material.id),
        )
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Inactive materials cannot be added to a requirement.",
        );
      }
      const materialById = new Map(materials.map((item) => [item.id, item]));
      for (const line of input.lines) {
        const material = materialById.get(line.materialId)!;
        const decimalPlaces = line.quantity.split(".")[1]?.length ?? 0;
        const allowedScale = Math.min(material.defaultUnit.decimalScale, 3);
        if (decimalPlaces > allowedScale) {
          throw new AppError(
            "VALIDATION_ERROR",
            `${material.name} supports up to ${allowedScale} decimal places.`,
            400,
            { lines: ["Review the quantity precision for each material."] },
          );
        }
      }

      const now = new Date();
      const neededBy = requirementDateInput(input.neededBy);
      const requirement = before
        ? await transaction.materialRequirement.update({
            where: { id: before.id },
            data: {
              projectId: input.projectId,
              siteId: input.siteId,
              neededBy,
              purpose: input.purpose,
              notes: input.notes,
            },
          })
        : await transaction.materialRequirement.create({
            data: {
              requirementNumber: await TransactionNumberService.next(
                "MR",
                now,
                transaction,
              ),
              projectId: input.projectId,
              siteId: input.siteId,
              neededBy,
              purpose: input.purpose,
              notes: input.notes,
              createdById: principal.userId,
            },
          });

      const selectedMaterialIds = input.lines.map((line) => line.materialId);
      await transaction.materialRequirementLine.updateMany({
        where: {
          requirementId: requirement.id,
          materialId: { notIn: selectedMaterialIds },
          isActive: true,
        },
        data: { isActive: false },
      });
      for (const [position, line] of input.lines.entries()) {
        const material = materialById.get(line.materialId)!;
        await transaction.materialRequirementLine.upsert({
          where: {
            requirementId_materialId: {
              requirementId: requirement.id,
              materialId: line.materialId,
            },
          },
          create: {
            requirementId: requirement.id,
            materialId: line.materialId,
            unitId: material.defaultUnitId,
            quantity: line.quantity,
            notes: line.notes,
            position,
          },
          update: {
            unitId: material.defaultUnitId,
            quantity: line.quantity,
            notes: line.notes,
            position,
            isActive: true,
          },
        });
      }

      const afterLines = await transaction.materialRequirementLine.findMany({
        where: { requirementId: requirement.id },
        orderBy: { position: "asc" },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: "MaterialRequirement",
          entityId: requirement.id,
          before: before
            ? {
                projectId: before.projectId,
                siteId: before.siteId,
                neededBy: before.neededBy,
                purpose: before.purpose,
                notes: before.notes,
                lines: lineEvidence(before.lines),
              }
            : undefined,
          after: {
            requirementNumber: requirement.requirementNumber,
            projectId: requirement.projectId,
            siteId: requirement.siteId,
            status: requirement.status,
            neededBy: requirement.neededBy,
            purpose: requirement.purpose,
            notes: requirement.notes,
            lines: lineEvidence(afterLines),
          },
        },
        transaction,
      );
      return { id: requirement.id };
    });
  },
};
