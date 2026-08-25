import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "@/db/prisma";
import { requirePermission } from "@/server/authorization/authorization";
import type { AuthenticatedPrincipal } from "@/types/application";

function requirementScope(
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

const requirementSelection = {
  id: true,
  requirementNumber: true,
  neededBy: true,
  purpose: true,
  project: { select: { projectCode: true, name: true } },
  site: { select: { siteCode: true, name: true, location: true } },
  lines: {
    where: { isActive: true },
    orderBy: { position: "asc" },
    select: {
      id: true,
      quantity: true,
      notes: true,
      material: { select: { materialCode: true, name: true } },
      unit: { select: { symbol: true } },
    },
  },
  _count: { select: { requestsForQuotation: true } },
} satisfies Prisma.MaterialRequirementSelect;

const rfqSelection = {
  id: true,
  rfqNumber: true,
  status: true,
  responseDueDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { displayName: true } },
  requirement: { select: requirementSelection },
  invitedSuppliers: {
    where: { isActive: true },
    orderBy: { supplier: { legalName: "asc" } },
    select: {
      supplier: {
        select: {
          id: true,
          supplierCode: true,
          legalName: true,
          tradeName: true,
          city: true,
        },
      },
    },
  },
} satisfies Prisma.RequestForQuotationSelect;

function mapRequirement(
  record: Prisma.MaterialRequirementGetPayload<{
    select: typeof requirementSelection;
  }>,
) {
  return {
    ...record,
    neededBy: record.neededBy.toISOString().slice(0, 10),
    lines: record.lines.map((line) => ({
      ...line,
      quantity: line.quantity.toString(),
    })),
  };
}

export async function getProcurementWorkspace(
  principal: AuthenticatedPrincipal,
) {
  requirePermission(principal, "purchase.view");
  const scope = requirementScope(principal);
  const [requirements, rfqs, suppliers] = await Promise.all([
    db.materialRequirement.findMany({
      where: { status: "APPROVED", AND: scope },
      orderBy: [{ neededBy: "asc" }, { requirementNumber: "asc" }],
      select: requirementSelection,
    }),
    db.requestForQuotation.findMany({
      where: { requirement: scope },
      orderBy: [{ updatedAt: "desc" }, { rfqNumber: "desc" }],
      select: rfqSelection,
    }),
    db.supplier.findMany({
      where: { isActive: true },
      orderBy: { legalName: "asc" },
      select: {
        id: true,
        supplierCode: true,
        legalName: true,
        tradeName: true,
        city: true,
        state: true,
        isGstRegistered: true,
      },
    }),
  ]);
  return {
    requirements: requirements.map(mapRequirement),
    rfqs: rfqs.map((rfq) => ({
      ...rfq,
      responseDueDate: rfq.responseDueDate.toISOString().slice(0, 10),
      createdAt: rfq.createdAt.toISOString(),
      updatedAt: rfq.updatedAt.toISOString(),
      requirement: mapRequirement(rfq.requirement),
    })),
    suppliers,
  };
}

export type ProcurementWorkspace = Awaited<
  ReturnType<typeof getProcurementWorkspace>
>;
