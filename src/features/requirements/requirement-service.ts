import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  AuditAction,
  MaterialRequirementStatus,
  MaterialRequirementSubmitterRole,
  MaterialRequirementWorkflowAction,
  ProjectAssignmentRole,
  SiteAssignmentRole,
} from "@/generated/prisma/enums";

import { db } from "@/db/prisma";
import {
  requirementDateInput,
  type RequirementDecisionInput,
  type RequirementDraftInput,
  type RequirementSubmitInput,
} from "@/features/requirements/requirement-schemas";
import {
  canDecideRequirement,
  resolveRequirementSubmitterRole,
  type RequirementPolicyFacts,
} from "@/features/requirements/requirement-policy";
import { AuditService } from "@/server/audit/audit-service";
import { requirePermission } from "@/server/authorization/authorization";
import { AppError } from "@/server/errors/app-error";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";
import type { AuthenticatedPrincipal } from "@/types/application";

function requirementScope(
  principal: AuthenticatedPrincipal,
): Prisma.MaterialRequirementWhereInput {
  if (
    principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") ||
    principal.roleCodes.includes("PROJECT_DIRECTOR")
  )
    return {};
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

async function policyFacts(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  requirement: {
    status: MaterialRequirementStatus;
    createdById: string;
    submittedById: string | null;
    submittedByRole: MaterialRequirementSubmitterRole | null;
    projectId: string;
    siteId: string;
  },
): Promise<RequirementPolicyFacts> {
  if (!principal.employeeId) {
    return {
      status: requirement.status,
      createdById: requirement.createdById,
      submittedById: requirement.submittedById,
      submittedByRole: requirement.submittedByRole,
      isProjectManagerAssigned: false,
      isSiteSupervisorAssigned: false,
    };
  }
  const [projectManager, siteSupervisor] = await Promise.all([
    transaction.projectAssignment.findFirst({
      where: {
        projectId: requirement.projectId,
        employeeId: principal.employeeId,
        role: ProjectAssignmentRole.PROJECT_MANAGER,
        isActive: true,
      },
      select: { id: true },
    }),
    transaction.siteAssignment.findFirst({
      where: {
        siteId: requirement.siteId,
        employeeId: principal.employeeId,
        role: SiteAssignmentRole.SITE_SUPERVISOR,
        isActive: true,
      },
      select: { id: true },
    }),
  ]);
  return {
    status: requirement.status,
    createdById: requirement.createdById,
    submittedById: requirement.submittedById,
    submittedByRole: requirement.submittedByRole,
    isProjectManagerAssigned: Boolean(projectManager),
    isSiteSupervisorAssigned: Boolean(siteSupervisor),
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

  async submit(
    principal: AuthenticatedPrincipal,
    input: RequirementSubmitInput,
  ) {
    requirePermission(principal, "material_requirement.create");
    return db.$transaction(async (transaction) => {
      const requirement = await transaction.materialRequirement.findFirst({
        where: { id: input.requirementId, AND: requirementScope(principal) },
        include: {
          lines: { where: { isActive: true }, select: { id: true } },
          project: { select: { status: true } },
          site: { select: { status: true } },
        },
      });
      if (!requirement) throw new AppError("NOT_FOUND");
      if (requirement.status !== MaterialRequirementStatus.DRAFT) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a draft requirement can be submitted.",
        );
      }
      if (!requirement.lines.length) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Add at least one material line before submitting.",
        );
      }
      if (
        ["COMPLETED", "CANCELLED"].includes(requirement.project.status) ||
        ["COMPLETED", "CANCELLED"].includes(requirement.site.status)
      ) {
        throw new AppError(
          "CONFLICT",
          "Requirements for a completed or cancelled project site cannot be submitted.",
        );
      }
      const facts = await policyFacts(transaction, principal, requirement);
      const submitterRole = resolveRequirementSubmitterRole(principal, facts);
      if (!submitterRole) {
        throw new AppError(
          "FORBIDDEN",
          "Only an assigned Site Supervisor or Project Manager can submit this requirement.",
        );
      }
      const now = new Date();
      const changed = await transaction.materialRequirement.updateMany({
        where: { id: requirement.id, status: MaterialRequirementStatus.DRAFT },
        data: {
          status: MaterialRequirementStatus.SUBMITTED,
          submittedById: principal.userId,
          submittedByRole: submitterRole,
          submittedAt: now,
          decidedById: null,
          decidedAt: null,
          decisionReason: null,
        },
      });
      if (changed.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "This requirement changed before it could be submitted. Refresh and try again.",
        );
      }
      await transaction.materialRequirementWorkflowEvent.create({
        data: {
          requirementId: requirement.id,
          action: MaterialRequirementWorkflowAction.SUBMIT,
          fromStatus: MaterialRequirementStatus.DRAFT,
          toStatus: MaterialRequirementStatus.SUBMITTED,
          actorUserId: principal.userId,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction.SUBMIT,
          entityType: "MaterialRequirement",
          entityId: requirement.id,
          before: { status: requirement.status },
          after: {
            status: MaterialRequirementStatus.SUBMITTED,
            submittedByRole: submitterRole,
            submittedAt: now,
          },
        },
        transaction,
      );
      return { id: requirement.id };
    });
  },

  async decide(
    principal: AuthenticatedPrincipal,
    input: RequirementDecisionInput,
  ) {
    requirePermission(principal, "material_requirement.approve");
    return db.$transaction(async (transaction) => {
      const requirement = await transaction.materialRequirement.findFirst({
        where: { id: input.requirementId, AND: requirementScope(principal) },
      });
      if (!requirement) throw new AppError("NOT_FOUND");
      if (requirement.status !== MaterialRequirementStatus.SUBMITTED) {
        throw new AppError(
          "INVALID_STATUS_TRANSITION",
          "Only a submitted requirement can be decided.",
        );
      }
      const facts = await policyFacts(transaction, principal, requirement);
      if (!canDecideRequirement(principal, facts)) {
        throw new AppError(
          "FORBIDDEN",
          "This decision violates the requirement approval or separation-of-duties policy.",
        );
      }
      const targetStatus =
        input.decision === "APPROVE"
          ? MaterialRequirementStatus.APPROVED
          : input.decision === "REJECT"
            ? MaterialRequirementStatus.REJECTED
            : MaterialRequirementStatus.DRAFT;
      const now = new Date();
      const sentBack = input.decision === "SEND_BACK";
      const changed = await transaction.materialRequirement.updateMany({
        where: {
          id: requirement.id,
          status: MaterialRequirementStatus.SUBMITTED,
          submittedById: requirement.submittedById,
        },
        data: sentBack
          ? {
              status: targetStatus,
              submittedById: null,
              submittedByRole: null,
              submittedAt: null,
              decidedById: null,
              decidedAt: null,
              decisionReason: null,
            }
          : {
              status: targetStatus,
              decidedById: principal.userId,
              decidedAt: now,
              decisionReason: input.decision === "REJECT" ? input.reason : null,
            },
      });
      if (changed.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "This requirement was already decided. Refresh to see its current status.",
        );
      }
      await transaction.materialRequirementWorkflowEvent.create({
        data: {
          requirementId: requirement.id,
          action: input.decision,
          fromStatus: MaterialRequirementStatus.SUBMITTED,
          toStatus: targetStatus,
          actorUserId: principal.userId,
          reason: input.reason,
        },
      });
      await AuditService.record(
        {
          actorUserId: principal.userId,
          action: AuditAction[input.decision],
          entityType: "MaterialRequirement",
          entityId: requirement.id,
          reason: input.reason,
          before: {
            status: requirement.status,
            submittedById: requirement.submittedById,
            submittedByRole: requirement.submittedByRole,
          },
          after: { status: targetStatus, decidedAt: sentBack ? null : now },
        },
        transaction,
      );
      return { id: requirement.id };
    });
  },
};
