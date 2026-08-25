import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/db/prisma";
import {
  canDecideRequirement,
  requirementStatusLabel,
  resolveRequirementSubmitterRole,
} from "@/features/requirements/requirement-policy";
import { requirePermission } from "@/server/authorization/authorization";
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

function projectScope(
  principal: AuthenticatedPrincipal,
): Prisma.ProjectWhereInput {
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")) return {};
  if (!principal.employeeId) {
    return { id: { equals: "00000000-0000-0000-0000-000000000000" } };
  }
  return {
    OR: [
      {
        assignments: {
          some: { employeeId: principal.employeeId, isActive: true },
        },
      },
      {
        sites: {
          some: {
            assignments: {
              some: { employeeId: principal.employeeId, isActive: true },
            },
          },
        },
      },
    ],
  };
}

const requirementSelection = {
  id: true,
  requirementNumber: true,
  status: true,
  neededBy: true,
  purpose: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  createdBy: { select: { displayName: true } },
  submittedById: true,
  submittedByRole: true,
  submittedAt: true,
  submittedBy: { select: { displayName: true } },
  decidedById: true,
  decidedAt: true,
  decisionReason: true,
  decidedBy: { select: { displayName: true } },
  project: { select: { id: true, projectCode: true, name: true } },
  site: { select: { id: true, siteCode: true, name: true } },
  workflowEvents: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      action: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      actorUser: { select: { displayName: true } },
    },
  },
  lines: {
    where: { isActive: true },
    orderBy: { position: "asc" },
    select: {
      id: true,
      materialId: true,
      quantity: true,
      notes: true,
      material: { select: { materialCode: true, name: true, isActive: true } },
      unit: { select: { id: true, code: true, name: true, symbol: true } },
    },
  },
} satisfies Prisma.MaterialRequirementSelect;

function mapRequirement(
  record: Prisma.MaterialRequirementGetPayload<{
    select: typeof requirementSelection;
  }>,
  principal: AuthenticatedPrincipal,
  projectManagerProjectIds: ReadonlySet<string>,
  supervisorSiteIds: ReadonlySet<string>,
) {
  const facts = {
    status: record.status,
    createdById: record.createdById,
    submittedById: record.submittedById,
    submittedByRole: record.submittedByRole,
    isProjectManagerAssigned: projectManagerProjectIds.has(record.project.id),
    isSiteSupervisorAssigned: supervisorSiteIds.has(record.site.id),
  };
  return {
    ...record,
    statusLabel: requirementStatusLabel(record.status),
    neededBy: record.neededBy.toISOString().slice(0, 10),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    workflowEvents: record.workflowEvents.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
      fromStatusLabel: requirementStatusLabel(event.fromStatus),
      toStatusLabel: requirementStatusLabel(event.toStatus),
    })),
    capabilities: {
      canEdit:
        record.status === "DRAFT" &&
        record.createdById === principal.userId &&
        principal.permissions.includes("material_requirement.create"),
      canSubmit: Boolean(resolveRequirementSubmitterRole(principal, facts)),
      canDecide: canDecideRequirement(principal, facts),
    },
    lines: record.lines.map((line) => ({
      ...line,
      quantity: line.quantity.toString(),
    })),
  };
}

export async function getRequirementWorkspace(
  principal: AuthenticatedPrincipal,
) {
  requirePermission(principal, "material_requirement.view");
  const [
    requirements,
    projects,
    materials,
    projectManagerAssignments,
    supervisorAssignments,
  ] = await Promise.all([
    db.materialRequirement.findMany({
      where: requirementScope(principal),
      orderBy: [{ updatedAt: "desc" }, { requirementNumber: "desc" }],
      select: requirementSelection,
    }),
    db.project.findMany({
      where: {
        AND: [
          projectScope(principal),
          { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        projectCode: true,
        name: true,
        sites: {
          where: {
            status: { notIn: ["COMPLETED", "CANCELLED"] },
            ...(principal.roleCodes.includes("SYSTEM_ADMINISTRATOR")
              ? {}
              : {
                  OR: [
                    {
                      assignments: {
                        some: {
                          employeeId: principal.employeeId ?? undefined,
                          isActive: true,
                        },
                      },
                    },
                    {
                      project: {
                        assignments: {
                          some: {
                            employeeId: principal.employeeId ?? undefined,
                            isActive: true,
                          },
                        },
                      },
                    },
                  ],
                }),
          },
          orderBy: { name: "asc" },
          select: { id: true, siteCode: true, name: true },
        },
      },
    }),
    db.material.findMany({
      where: { isActive: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        materialCode: true,
        name: true,
        category: { select: { name: true } },
        defaultUnit: { select: { id: true, symbol: true, decimalScale: true } },
      },
    }),
    principal.employeeId
      ? db.projectAssignment.findMany({
          where: {
            employeeId: principal.employeeId,
            role: "PROJECT_MANAGER",
            isActive: true,
          },
          select: { projectId: true },
        })
      : Promise.resolve([]),
    principal.employeeId
      ? db.siteAssignment.findMany({
          where: {
            employeeId: principal.employeeId,
            role: "SITE_SUPERVISOR",
            isActive: true,
          },
          select: { siteId: true },
        })
      : Promise.resolve([]),
  ]);
  const projectManagerProjectIds = new Set(
    projectManagerAssignments.map(({ projectId }) => projectId),
  );
  const supervisorSiteIds = new Set(
    supervisorAssignments.map(({ siteId }) => siteId),
  );
  return {
    requirements: requirements.map((requirement) =>
      mapRequirement(
        requirement,
        principal,
        projectManagerProjectIds,
        supervisorSiteIds,
      ),
    ),
    projects,
    materials,
  };
}

export async function getRequirementDetail(
  principal: AuthenticatedPrincipal,
  requirementId: string,
) {
  requirePermission(principal, "material_requirement.view");
  const workspace = await getRequirementWorkspace(principal);
  const requirement = workspace.requirements.find(
    (item) => item.id === requirementId,
  );
  return requirement ? { requirement, ...workspace } : null;
}

export type RequirementWorkspace = Awaited<
  ReturnType<typeof getRequirementWorkspace>
>;
export type RequirementDetail = NonNullable<
  Awaited<ReturnType<typeof getRequirementDetail>>
>;
