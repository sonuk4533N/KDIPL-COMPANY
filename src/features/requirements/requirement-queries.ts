import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/db/prisma";
import { requirePermission } from "@/server/authorization/authorization";
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
  project: { select: { id: true, projectCode: true, name: true } },
  site: { select: { id: true, siteCode: true, name: true } },
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
) {
  return {
    ...record,
    neededBy: record.neededBy.toISOString().slice(0, 10),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
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
  const [requirements, projects, materials] = await Promise.all([
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
  ]);
  return {
    requirements: requirements.map(mapRequirement),
    projects,
    materials,
  };
}

export async function getRequirementDetail(
  principal: AuthenticatedPrincipal,
  requirementId: string,
) {
  requirePermission(principal, "material_requirement.view");
  const [requirement, workspace] = await Promise.all([
    db.materialRequirement.findFirst({
      where: { id: requirementId, AND: requirementScope(principal) },
      select: requirementSelection,
    }),
    getRequirementWorkspace(principal),
  ]);
  return requirement
    ? { requirement: mapRequirement(requirement), ...workspace }
    : null;
}

export type RequirementWorkspace = Awaited<
  ReturnType<typeof getRequirementWorkspace>
>;
export type RequirementDetail = NonNullable<
  Awaited<ReturnType<typeof getRequirementDetail>>
>;
