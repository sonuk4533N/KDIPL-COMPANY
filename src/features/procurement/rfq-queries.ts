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
    principal.roleCodes.includes("PURCHASE_MANAGER") ||
    principal.roleCodes.includes("PROJECT_DIRECTOR")
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
  createdById: true,
  issuedAt: true,
  recommendedQuotationId: true,
  recommendedById: true,
  recommendedAt: true,
  recommendationReason: true,
  decidedAt: true,
  decisionReason: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { displayName: true } },
  issuedBy: { select: { displayName: true } },
  recommendedBy: { select: { displayName: true } },
  decidedBy: { select: { displayName: true } },
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
  quotations: {
    orderBy: { landedTotal: "asc" },
    select: {
      id: true,
      supplierId: true,
      quoteReference: true,
      quoteDate: true,
      validUntil: true,
      offeredDeliveryDate: true,
      paymentTerms: true,
      currency: true,
      subtotal: true,
      gstRate: true,
      gstAmount: true,
      freightAmount: true,
      landedTotal: true,
      notes: true,
      supplier: {
        select: {
          supplierCode: true,
          legalName: true,
          tradeName: true,
          city: true,
        },
      },
      lines: {
        orderBy: { requirementLine: { position: "asc" } },
        select: {
          id: true,
          requirementLineId: true,
          quantity: true,
          unitPrice: true,
          lineSubtotal: true,
          requirementLine: {
            select: {
              material: { select: { materialCode: true, name: true } },
              unit: { select: { symbol: true } },
            },
          },
        },
      },
      documents: {
        select: {
          id: true,
          fileRecord: {
            select: { id: true, filename: true, mimeType: true, size: true },
          },
        },
      },
    },
  },
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
  purchaseOrder: {
    select: {
      id: true,
      poNumber: true,
      status: true,
      totalAmount: true,
      expectedDeliveryDate: true,
      supplier: { select: { legalName: true, tradeName: true } },
    },
  },
} satisfies Prisma.RequestForQuotationSelect;

const rfqStatusLabels = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  RECOMMENDED: "Recommended",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as const;

function statusLabel(status: string) {
  return rfqStatusLabels[status as keyof typeof rfqStatusLabels] ?? "Draft";
}

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

function mapRfq(
  rfq: Prisma.RequestForQuotationGetPayload<{ select: typeof rfqSelection }>,
  principal: AuthenticatedPrincipal,
) {
  const isPurchaseManager =
    principal.roleCodes.includes("PURCHASE_MANAGER") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  return {
    ...rfq,
    statusLabel: statusLabel(rfq.status),
    responseDueDate: rfq.responseDueDate.toISOString().slice(0, 10),
    issuedAt: rfq.issuedAt?.toISOString() ?? null,
    recommendedAt: rfq.recommendedAt?.toISOString() ?? null,
    decidedAt: rfq.decidedAt?.toISOString() ?? null,
    createdAt: rfq.createdAt.toISOString(),
    updatedAt: rfq.updatedAt.toISOString(),
    requirement: mapRequirement(rfq.requirement),
    quotations: rfq.quotations.map((quotation) => ({
      ...quotation,
      quoteDate: quotation.quoteDate.toISOString().slice(0, 10),
      validUntil: quotation.validUntil.toISOString().slice(0, 10),
      offeredDeliveryDate: quotation.offeredDeliveryDate
        .toISOString()
        .slice(0, 10),
      subtotal: quotation.subtotal.toFixed(2),
      gstRate: quotation.gstRate.toFixed(2),
      gstAmount: quotation.gstAmount.toFixed(2),
      freightAmount: quotation.freightAmount.toFixed(2),
      landedTotal: quotation.landedTotal.toFixed(2),
      lines: quotation.lines.map((line) => ({
        ...line,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toFixed(2),
        lineSubtotal: line.lineSubtotal.toFixed(2),
      })),
      documents: quotation.documents.map((document) => ({
        ...document,
        fileRecord: {
          ...document.fileRecord,
          size: document.fileRecord.size.toString(),
        },
      })),
    })),
    workflowEvents: rfq.workflowEvents.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
      fromStatusLabel: statusLabel(event.fromStatus),
      toStatusLabel: statusLabel(event.toStatus),
    })),
    purchaseOrder: rfq.purchaseOrder
      ? {
          ...rfq.purchaseOrder,
          totalAmount: rfq.purchaseOrder.totalAmount.toFixed(2),
          expectedDeliveryDate: rfq.purchaseOrder.expectedDeliveryDate
            .toISOString()
            .slice(0, 10),
        }
      : null,
    capabilities: {
      canEdit:
        rfq.status === "DRAFT" &&
        rfq.createdById === principal.userId &&
        principal.permissions.includes("purchase.create"),
      canIssue: rfq.status === "DRAFT" && isPurchaseManager,
      canRecordQuotation: rfq.status === "ISSUED" && isPurchaseManager,
      canRecommend:
        rfq.status === "ISSUED" &&
        isPurchaseManager &&
        rfq.quotations.length > 0,
      canCancel:
        (rfq.status === "DRAFT" || rfq.status === "ISSUED") &&
        isPurchaseManager,
      canDecide:
        rfq.status === "RECOMMENDED" &&
        principal.permissions.includes("purchase.approve") &&
        principal.roleCodes.includes("PROJECT_DIRECTOR") &&
        !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") &&
        principal.userId !== rfq.createdById &&
        principal.userId !== rfq.recommendedById,
    },
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
    rfqs: rfqs.map((rfq) => mapRfq(rfq, principal)),
    suppliers,
  };
}

export async function getRfqDetail(
  principal: AuthenticatedPrincipal,
  rfqId: string,
) {
  const workspace = await getProcurementWorkspace(principal);
  const rfq = workspace.rfqs.find(({ id }) => id === rfqId);
  return rfq ? { rfq, ...workspace } : null;
}

export type ProcurementWorkspace = Awaited<
  ReturnType<typeof getProcurementWorkspace>
>;
export type RfqDetail = NonNullable<Awaited<ReturnType<typeof getRfqDetail>>>;
