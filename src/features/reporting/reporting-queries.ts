import "server-only";

import { db } from "@/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  hasPermission,
  requirePermission,
} from "@/server/authorization/authorization";
import {
  financialReportRows,
  financialReportTypes,
  type FinancialReportType,
} from "@/server/finance/reports";
import type { ReportRow } from "@/server/finance/report-export";
import type { AuthenticatedPrincipal } from "@/types/application";
import {
  budgetPosition,
  indianFinancialYear,
  lowStockPosition,
  supplierPerformance,
} from "./reporting-domain";
import { canViewReport, getReportDefinition } from "./report-catalog";
import { getReportingScope, scopedId } from "./reporting-scope";

export type ReportFilters = {
  financialYear?: string;
  projectId?: string;
  status?: string;
  from?: string;
  to?: string;
  asOf?: string;
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function dateRange(filters: ReportFilters) {
  const from = filters.from
    ? new Date(`${filters.from}T00:00:00.000Z`)
    : undefined;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined;
  if (from && to && to.getTime() - from.getTime() > 5 * 366 * 86_400_000)
    throw new Error("Detail report date range cannot exceed five years.");
  return { from, to };
}

type LedgerBalance = {
  locationId: string;
  materialId: string;
  unitId: string;
  quantity: Prisma.Decimal;
};

type ValuationEntry = {
  id: string;
  locationId: string;
  materialId: string;
  unitId: string;
  signedQuantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  createdAt: Date;
};

async function ledgerBalances(locationIds: string[] | null, asOf?: Date) {
  const locationClause =
    locationIds === null
      ? Prisma.empty
      : locationIds.length
        ? Prisma.sql`AND st."locationId" IN (${Prisma.join(locationIds.map((id) => Prisma.sql`${id}::uuid`))})`
        : Prisma.sql`AND FALSE`;
  const dateClause = asOf
    ? Prisma.sql`AND st."createdAt" <= ${asOf}`
    : Prisma.empty;
  return db.$queryRaw<LedgerBalance[]>(Prisma.sql`
    SELECT st."locationId", st."materialId", st."unitId",
      SUM(CASE
        WHEN st.type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') THEN st.quantity
        WHEN st.type IN ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT') THEN -st.quantity
        WHEN st.type='REVERSAL' AND original.type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') THEN -st.quantity
        WHEN st.type='REVERSAL' THEN st.quantity ELSE 0 END)::DECIMAL(18,3) AS quantity
    FROM "StockTransaction" st
    LEFT JOIN "StockTransaction" original ON original.id=st."reversalOfId"
    WHERE TRUE ${locationClause} ${dateClause}
    GROUP BY st."locationId", st."materialId", st."unitId"
    ORDER BY st."locationId", st."materialId", st."unitId"
    LIMIT 1000`);
}

async function stockValuation(
  locationIds: string[] | null,
  asOf: Date | undefined,
  method:
    | "MOVING_WEIGHTED_AVERAGE"
    | "FIFO"
    | "LAST_APPROVED_PURCHASE_RATE"
    | "QUANTITY_ONLY",
) {
  const values = new Map<string, Prisma.Decimal | null>();
  if (method === "QUANTITY_ONLY") return values;
  const locationClause =
    locationIds === null
      ? Prisma.empty
      : locationIds.length
        ? Prisma.sql`AND s."locationId" IN (${Prisma.join(locationIds.map((id) => Prisma.sql`${id}::uuid`))})`
        : Prisma.sql`AND FALSE`;
  const dateClause = asOf
    ? Prisma.sql`AND s."createdAt" <= ${asOf}`
    : Prisma.empty;
  const entries = await db.$queryRaw<ValuationEntry[]>(Prisma.sql`
    SELECT v.id, v."locationId", v."materialId", v."unitId", v."signedQuantity", v."unitCost", s."createdAt"
    FROM "CustomerInventoryValuation" v
    JOIN "StockTransaction" s ON s.id=v.id
    WHERE TRUE ${locationClause} ${dateClause}
    ORDER BY s."createdAt", s.id
    LIMIT 50000`);
  const purchaseRates = new Map<string, Prisma.Decimal>();
  if (method === "LAST_APPROVED_PURCHASE_RATE") {
    const rates = await db.$queryRaw<
      Array<{
        materialId: string;
        unitId: string;
        unitPrice: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT DISTINCT ON (s."materialId", s."unitId") s."materialId", s."unitId", pol."unitPrice"
      FROM "StockTransaction" s
      JOIN "GoodsReceiptLine" grl ON grl.id=s."goodsReceiptLineId"
      JOIN "GoodsReceipt" gr ON gr.id=grl."goodsReceiptId" AND gr.status='POSTED'
      JOIN "PurchaseOrderLine" pol ON pol.id=grl."purchaseOrderLineId"
      WHERE TRUE ${dateClause}
      ORDER BY s."materialId", s."unitId", s."createdAt" DESC, s.id DESC`);
    for (const rate of rates)
      purchaseRates.set(`${rate.materialId}:${rate.unitId}`, rate.unitPrice);
  }
  const grouped = new Map<string, ValuationEntry[]>();
  for (const entry of entries) {
    const key = `${entry.locationId}:${entry.materialId}:${entry.unitId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  for (const [key, group] of grouped) {
    if (method === "LAST_APPROVED_PURCHASE_RATE") {
      const quantity = group.reduce(
        (sum, entry) => sum.plus(entry.signedQuantity),
        new Prisma.Decimal(0),
      );
      const rate = purchaseRates.get(
        `${group[0].materialId}:${group[0].unitId}`,
      );
      values.set(key, rate ? quantity.mul(rate) : null);
      continue;
    }
    if (group.some((entry) => !entry.unitCost)) {
      values.set(key, null);
      continue;
    }
    if (method === "MOVING_WEIGHTED_AVERAGE") {
      values.set(
        key,
        group.reduce(
          (sum, entry) => sum.plus(entry.signedQuantity.mul(entry.unitCost!)),
          new Prisma.Decimal(0),
        ),
      );
      continue;
    }
    const layers: Array<{ quantity: Prisma.Decimal; cost: Prisma.Decimal }> =
      [];
    for (const entry of group) {
      if (entry.signedQuantity.gt(0)) {
        layers.push({ quantity: entry.signedQuantity, cost: entry.unitCost! });
        continue;
      }
      let remaining = entry.signedQuantity.abs();
      while (remaining.gt(0) && layers.length) {
        const layer = layers[0];
        const consumed = Prisma.Decimal.min(layer.quantity, remaining);
        layer.quantity = layer.quantity.minus(consumed);
        remaining = remaining.minus(consumed);
        if (layer.quantity.isZero()) layers.shift();
      }
      if (remaining.gt(0)) {
        layers.length = 0;
        break;
      }
    }
    values.set(
      key,
      layers.reduce(
        (sum, layer) => sum.plus(layer.quantity.mul(layer.cost)),
        new Prisma.Decimal(0),
      ),
    );
  }
  return values;
}

export async function dashboardData(principal: AuthenticatedPrincipal) {
  const scope = await getReportingScope(principal);
  const projectId = scopedId(scope.projectIds);
  const locationId = scopedId(scope.locationIds);
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const projectWhere = projectId ? { id: projectId } : {};
  const requirementWhere = projectId ? { projectId } : {};
  const rfqScope = projectId ? { requirement: { projectId } } : {};
  const poScope = projectId ? { rfq: { requirement: { projectId } } } : {};
  const canFinance = hasPermission(principal, "invoice.view");
  const canProcurementSummary =
    hasPermission(principal, "purchase.view") ||
    principal.roleCodes.includes("PROJECT_MANAGER");

  const [
    requirements,
    sourcing,
    rfqs,
    recommendations,
    poSummary,
    overdueDeliveries,
    grnAction,
    negativeStock,
    stockTotals,
    projectCount,
    invoices,
    failedTally,
    pendingPayments,
  ] = await Promise.all([
    hasPermission(principal, "material_requirement.view")
      ? db.materialRequirement.count({
          where: { ...requirementWhere, status: "SUBMITTED" },
        })
      : 0,
    canProcurementSummary
      ? db.materialRequirement.count({
          where: {
            ...requirementWhere,
            status: "APPROVED",
            requestsForQuotation: { none: {} },
          },
        })
      : 0,
    canProcurementSummary
      ? db.requestForQuotation.count({
          where: { ...rfqScope, status: "ISSUED" },
        })
      : 0,
    canProcurementSummary
      ? db.requestForQuotation.count({
          where: { ...rfqScope, status: "RECOMMENDED" },
        })
      : 0,
    canProcurementSummary
      ? db.purchaseOrder.aggregate({
          where: {
            ...poScope,
            status: { notIn: ["DRAFT", "CANCELLED"] },
            createdAt: { gte: monthStart },
          },
          _sum: { totalAmount: true },
          _count: true,
        })
      : null,
    canProcurementSummary
      ? db.purchaseOrder.count({
          where: {
            ...poScope,
            expectedDeliveryDate: { lt: now },
            status: { in: ["ISSUED", "ACCEPTED", "PARTIALLY_RECEIVED"] },
          },
        })
      : 0,
    hasPermission(principal, "inventory.view")
      ? db.goodsReceipt.count({
          where: {
            ...(locationId ? { locationId } : {}),
            status: {
              in: ["DRAFT", "PHYSICALLY_VERIFIED", "PENDING_PM_APPROVAL"],
            },
          },
        })
      : 0,
    hasPermission(principal, "inventory.view")
      ? db.temporaryNegativeStockException.count({
          where: { ...(locationId ? { locationId } : {}), status: "OPEN" },
        })
      : 0,
    hasPermission(principal, "inventory.view")
      ? ledgerBalances(scope.locationIds)
      : null,
    hasPermission(principal, "project.view")
      ? db.project.count({ where: projectWhere })
      : 0,
    canFinance
      ? db.supplierInvoice.aggregate({
          where: {
            status: {
              in: ["APPROVED", "PARTIALLY_PAID", "PAID", "PAYMENT_HOLD"],
            },
          },
          _sum: { approvedPayable: true, paidAmount: true },
          _count: true,
        })
      : null,
    canFinance ? db.tallyExportEvent.count({ where: { status: "FAILED" } }) : 0,
    hasPermission(principal, "payment.view")
      ? db.supplierPayment.count({ where: { status: "PENDING_APPROVAL" } })
      : 0,
  ]);

  const cards = [
    hasPermission(principal, "project.view") && {
      label: "Projects in scope",
      value: String(projectCount),
      detail: scope.companyWide ? "Company-wide" : "Assignment scoped",
      tone: "blue",
    },
    hasPermission(principal, "material_requirement.view") && {
      label: "Requirements awaiting action",
      value: String(requirements),
      detail: "Submitted for approval",
      tone: requirements ? "amber" : "green",
    },
    canProcurementSummary && {
      label: "Awaiting sourcing",
      value: String(sourcing),
      detail: "Approved requirements",
      tone: sourcing ? "amber" : "green",
    },
    canProcurementSummary && {
      label: "Open RFQs",
      value: String(rfqs),
      detail: `${recommendations} recommendations awaiting approval`,
      tone: rfqs ? "blue" : "green",
    },
    canProcurementSummary && {
      label: "Procurement this month",
      value: money.format(poSummary?._sum.totalAmount?.toNumber() ?? 0),
      detail: `${poSummary?._count ?? 0} committed POs`,
      tone: "blue",
    },
    canProcurementSummary && {
      label: "Overdue deliveries",
      value: String(overdueDeliveries),
      detail: "Open POs beyond delivery date",
      tone: overdueDeliveries ? "red" : "green",
    },
    hasPermission(principal, "inventory.view") && {
      label: "Current stock positions",
      value: String(
        stockTotals?.filter((row) => !row.quantity.isZero()).length ?? 0,
      ),
      detail: "Ledger-derived location/material/unit keys",
      tone: "blue",
    },
    hasPermission(principal, "inventory.view") && {
      label: "GRNs awaiting action",
      value: String(grnAction),
      detail: "Draft or approval workflow",
      tone: grnAction ? "amber" : "green",
    },
    hasPermission(principal, "inventory.view") && {
      label: "Negative-stock exceptions",
      value: String(negativeStock),
      detail: "Open correction deadlines",
      tone: negativeStock ? "red" : "green",
    },
    canFinance && {
      label: "Approved invoice actuals",
      value: money.format(invoices?._sum.approvedPayable?.toNumber() ?? 0),
      detail: `${invoices?._count ?? 0} approved invoices`,
      tone: "blue",
    },
    canFinance && {
      label: "Supplier payables",
      value: money.format(
        (invoices?._sum.approvedPayable?.toNumber() ?? 0) -
          (invoices?._sum.paidAmount?.toNumber() ?? 0),
      ),
      detail: `${pendingPayments} payments awaiting approval`,
      tone: "amber",
    },
    canFinance && {
      label: "Failed Tally exports",
      value: String(failedTally),
      detail: "Requires Accounts follow-up",
      tone: failedTally ? "red" : "green",
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    detail: string;
    tone: string;
  }>;

  const valuation = await db.stockValuationPolicy.findFirst({
    where: {
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  return {
    cards,
    financialYear: indianFinancialYear(now),
    scopeLabel: scope.companyWide
      ? "Company-wide visibility"
      : "Authorized assignments only",
    freshness: now.toISOString(),
    valuationMethod: valuation?.method ?? "QUANTITY_ONLY",
    valuationWarning: !valuation || valuation.method === "QUANTITY_ONLY",
  };
}

export async function reportRows(
  principal: AuthenticatedPrincipal,
  reportId: string,
  filters: ReportFilters = {},
): Promise<ReportRow[]> {
  const definition = getReportDefinition(reportId);
  if (!definition) return [];
  if (!canViewReport(principal, definition)) return [];
  requirePermission(principal, definition.permission);
  const scope = await getReportingScope(principal);
  const requestedProjectIds = filters.projectId
    ? [filters.projectId]
    : scope.projectIds;
  if (
    filters.projectId &&
    scope.projectIds &&
    !scope.projectIds.includes(filters.projectId)
  )
    return [];
  const projectId = scopedId(requestedProjectIds);
  const locationId = scopedId(scope.locationIds);
  const range = dateRange(filters);

  if (financialReportTypes.includes(reportId as FinancialReportType)) {
    requirePermission(principal, "invoice.view");
    return financialReportRows(reportId as FinancialReportType);
  }

  if (
    [
      "current-stock-location",
      "current-stock-project",
      "stock-as-of",
      "stock-ledger",
    ].includes(reportId)
  ) {
    const asOf = filters.asOf
      ? new Date(`${filters.asOf}T23:59:59.999Z`)
      : range.to;
    if (reportId === "stock-ledger") {
      const transactions = await db.stockTransaction.findMany({
        where: {
          ...(locationId ? { locationId } : {}),
          ...(range.from || range.to
            ? { createdAt: { gte: range.from, lte: range.to } }
            : {}),
        },
        include: { location: true, material: true, unit: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1000,
      });
      const reversed = new Set(
        transactions
          .map((row) => row.reversalOfId)
          .filter((id): id is string => Boolean(id)),
      );
      return transactions.map((row) => ({
        transactionNumber: row.transactionNumber,
        date: row.createdAt.toISOString(),
        location: row.location.name,
        material: row.material.name,
        type: row.type,
        quantity: row.quantity.toString(),
        unit: row.unit.symbol,
        status: row.reversalOfId
          ? "REVERSAL"
          : reversed.has(row.id)
            ? "REVERSED"
            : "POSTED",
        reason: row.reason,
      }));
    }
    const reportDate = asOf ?? new Date();
    const [rows, policy] = await Promise.all([
      ledgerBalances(scope.locationIds, asOf),
      db.stockValuationPolicy.findFirst({
        where: {
          effectiveFrom: { lte: reportDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: reportDate } }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);
    const valuationMethod = policy?.method ?? "QUANTITY_ONLY";
    const values = await stockValuation(
      scope.locationIds,
      asOf,
      valuationMethod,
    );
    const [locations, materials, units] = await Promise.all([
      db.inventoryLocation.findMany({
        where: { id: { in: rows.map((row) => row.locationId) } },
        include: { project: true, site: true },
      }),
      db.material.findMany({
        where: { id: { in: rows.map((row) => row.materialId) } },
        select: { id: true, materialCode: true, name: true },
      }),
      db.unitOfMeasure.findMany({
        where: { id: { in: rows.map((row) => row.unitId) } },
        select: { id: true, symbol: true },
      }),
    ]);
    const lm = new Map(locations.map((row) => [row.id, row]));
    const mm = new Map(materials.map((row) => [row.id, row]));
    const um = new Map(units.map((row) => [row.id, row]));
    return rows.map((row) => ({
      location: lm.get(row.locationId)?.name ?? row.locationId,
      project: lm.get(row.locationId)?.project?.name ?? "Company store",
      site: lm.get(row.locationId)?.site?.name ?? "—",
      materialCode: mm.get(row.materialId)?.materialCode ?? row.materialId,
      material: mm.get(row.materialId)?.name ?? "Unknown",
      quantity: row.quantity.toString(),
      unit: um.get(row.unitId)?.symbol ?? "",
      asOf: asOf?.toISOString().slice(0, 10) ?? "Current",
      valuationPolicy: valuationMethod,
      policyEffectiveFrom:
        policy?.effectiveFrom.toISOString().slice(0, 10) ??
        "Awaiting CA approval",
      approvedStockValue:
        valuationMethod === "QUANTITY_ONLY"
          ? null
          : (values
              .get(`${row.locationId}:${row.materialId}:${row.unitId}`)
              ?.toFixed(2) ?? "insufficient cost data"),
    }));
  }

  if (reportId === "low-stock") {
    const settings = await db.lowStockSetting.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      take: 1000,
    });
    const balances = await ledgerBalances(scope.locationIds);
    const balance = new Map(
      balances.map((row) => [
        `${row.locationId}:${row.materialId}`,
        row.quantity,
      ]),
    );
    const low = settings.filter(
      (row) =>
        lowStockPosition({
          currentQuantity:
            balance.get(`${row.locationId}:${row.materialId}`) ?? 0,
          minimumLevel: row.minimumLevel,
          reorderLevel: row.reorderLevel,
        }).reorderRequired,
    );
    const [projects, locations, materials, requirementLines, purchaseLines] =
      await Promise.all([
        db.project.findMany({
          where: { id: { in: low.map((row) => row.projectId) } },
        }),
        db.inventoryLocation.findMany({
          where: { id: { in: low.map((row) => row.locationId) } },
        }),
        db.material.findMany({
          where: { id: { in: low.map((row) => row.materialId) } },
        }),
        db.materialRequirementLine.findMany({
          where: {
            materialId: { in: low.map((row) => row.materialId) },
            requirement: {
              projectId: { in: low.map((row) => row.projectId) },
              status: { in: ["SUBMITTED", "APPROVED"] },
            },
          },
          select: {
            materialId: true,
            quantity: true,
            requirement: { select: { projectId: true } },
          },
        }),
        db.purchaseOrderLine.findMany({
          where: {
            requirementLine: {
              materialId: { in: low.map((row) => row.materialId) },
              requirement: {
                projectId: { in: low.map((row) => row.projectId) },
              },
            },
            purchaseOrder: {
              status: { in: ["ISSUED", "ACCEPTED", "PARTIALLY_RECEIVED"] },
            },
          },
          select: {
            quantity: true,
            requirementLine: {
              select: {
                materialId: true,
                requirement: { select: { projectId: true } },
              },
            },
            purchaseOrder: { select: { expectedDeliveryDate: true } },
            goodsReceiptLines: {
              where: { goodsReceipt: { status: "POSTED" } },
              select: { acceptedQuantity: true },
            },
          },
        }),
      ]);
    return low.map((row) => {
      const position = lowStockPosition({
        currentQuantity:
          balance.get(`${row.locationId}:${row.materialId}`) ?? 0,
        minimumLevel: row.minimumLevel,
        reorderLevel: row.reorderLevel,
      });
      const requirementQuantity = requirementLines
        .filter(
          (line) =>
            line.materialId === row.materialId &&
            line.requirement.projectId === row.projectId,
        )
        .reduce((sum, line) => sum.plus(line.quantity), new Prisma.Decimal(0));
      const openLines = purchaseLines.filter(
        (line) =>
          line.requirementLine.materialId === row.materialId &&
          line.requirementLine.requirement.projectId === row.projectId,
      );
      const openPoQuantity = openLines.reduce(
        (sum, line) =>
          sum
            .plus(line.quantity)
            .minus(
              line.goodsReceiptLines.reduce(
                (received, receipt) => received.plus(receipt.acceptedQuantity),
                new Prisma.Decimal(0),
              ),
            ),
        new Prisma.Decimal(0),
      );
      const expectedDelivery = openLines
        .map((line) => line.purchaseOrder.expectedDeliveryDate)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return {
        project:
          projects.find((p) => p.id === row.projectId)?.name ?? row.projectId,
        location:
          locations.find((l) => l.id === row.locationId)?.name ??
          row.locationId,
        material:
          materials.find((m) => m.id === row.materialId)?.name ??
          row.materialId,
        currentQuantity: position.currentQuantity,
        temporaryNegativeQuantity: position.temporaryNegativeQuantity,
        minimumLevel: row.minimumLevel.toString(),
        reorderLevel: row.reorderLevel.toString(),
        shortage: position.shortage,
        openMaterialRequirements: requirementQuantity.toFixed(3),
        openPoQuantity: Prisma.Decimal.max(openPoQuantity, 0).toFixed(3),
        expectedDeliveryDate:
          expectedDelivery?.toISOString().slice(0, 10) ?? "Unavailable",
      };
    });
  }

  if (["negative-stock", "stock-exceptions"].includes(reportId)) {
    const rows = await db.temporaryNegativeStockException.findMany({
      where: {
        ...(locationId ? { locationId } : {}),
        ...(filters.status
          ? { status: filters.status as "OPEN" | "RESOLVED" }
          : {}),
      },
      include: { location: true, material: true },
      orderBy: { resolutionDueAt: "asc" },
      take: 1000,
    });
    return rows.map((row) => ({
      location: row.location.name,
      material: row.material.name,
      deficit: row.deficitQuantity.toString(),
      status: row.status,
      detectedAt: row.detectedAt.toISOString(),
      correctionDue: row.resolutionDueAt.toISOString(),
      reason: row.reason,
    }));
  }

  if (reportId === "damaged-rejected") {
    const rows = await db.goodsReceiptException.findMany({
      where: {
        goodsReceiptLine: {
          goodsReceipt: { ...(locationId ? { locationId } : {}) },
        },
      },
      include: {
        goodsReceiptLine: {
          include: {
            material: true,
            goodsReceipt: { include: { location: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return rows.map((row) => ({
      grn: row.goodsReceiptLine.goodsReceipt.grnNumber,
      location: row.goodsReceiptLine.goodsReceipt.location.name,
      material: row.goodsReceiptLine.material.name,
      exception: row.type,
      quantity: row.quantity.toString(),
      status: row.status,
      resolution: row.financialResolutionType,
    }));
  }

  if (
    [
      "stock-losses",
      "transfers-pending",
      "physical-count-variance",
      "unused-returns",
      "project-closing-stock",
    ].includes(reportId)
  ) {
    const kind =
      reportId === "stock-losses"
        ? "NON_USABLE"
        : reportId === "transfers-pending"
          ? "TRANSFER"
          : reportId === "physical-count-variance"
            ? "COUNT"
            : reportId === "unused-returns"
              ? "RETURN"
              : undefined;
    const rows = await db.customerStockMovement.findMany({
      where: {
        ...(locationId ? { sourceLocationId: locationId } : {}),
        ...(kind ? { kind } : { closureProjectId: { not: null } }),
        ...(reportId === "transfers-pending"
          ? { status: { in: ["REQUESTED", "APPROVED", "DISPATCHED"] } }
          : {}),
      },
      include: { source: true, destination: true, material: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1000,
    });
    return rows.map((row) => ({
      number: row.number,
      type: row.kind,
      category: row.category,
      material: row.material.name,
      source: row.source.name,
      destination: row.destination?.name ?? row.disposition,
      requestedQuantity: row.quantity.toString(),
      bookQuantity: row.bookQuantity?.toString() ?? null,
      actualQuantity: row.actualQuantity?.toString() ?? null,
      variance:
        row.bookQuantity && row.actualQuantity
          ? row.actualQuantity.minus(row.bookQuantity).toString()
          : null,
      status: row.status,
      reason: row.reason,
    }));
  }

  if (
    [
      "pending-po-deliveries",
      "partial-po-deliveries",
      "purchases-project",
      "purchases-supplier",
      "overdue-delivery-value",
    ].includes(reportId)
  ) {
    const rows = await db.purchaseOrder.findMany({
      where: {
        ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
        ...(reportId === "partial-po-deliveries"
          ? { status: "PARTIALLY_RECEIVED" as const }
          : {}),
        ...(reportId.includes("pending") || reportId.includes("overdue")
          ? { status: { in: ["ISSUED", "ACCEPTED", "PARTIALLY_RECEIVED"] } }
          : {}),
        ...(reportId.includes("overdue")
          ? { expectedDeliveryDate: { lt: new Date() } }
          : {}),
        ...(range.from || range.to
          ? { createdAt: { gte: range.from, lte: range.to } }
          : {}),
      },
      include: {
        supplier: true,
        rfq: {
          include: { requirement: { include: { project: true, site: true } } },
        },
        goodsReceipts: {
          where: { status: "POSTED" },
          include: { lines: true },
        },
      },
      orderBy: [{ expectedDeliveryDate: "asc" }, { poNumber: "asc" }],
      take: 1000,
    });
    return rows.map((row) => ({
      poNumber: row.poNumber,
      project: row.rfq.requirement.project.name,
      site: row.rfq.requirement.site.name,
      supplier: row.supplier.legalName,
      status: row.status,
      committedValue: row.totalAmount.toString(),
      expectedDelivery: row.expectedDeliveryDate.toISOString().slice(0, 10),
      postedGrns: row.goodsReceipts.length,
    }));
  }

  if (reportId === "purchases-material") {
    const rows = await db.purchaseOrderLine.findMany({
      where: {
        purchaseOrder: {
          ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
      },
      include: {
        requirementLine: { include: { material: true } },
        purchaseOrder: true,
        unit: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return rows.map((row) => ({
      purchaseOrder: row.purchaseOrder.poNumber,
      materialCode: row.requirementLine.material.materialCode,
      material: row.requirementLine.material.name,
      quantity: row.quantity.toString(),
      unit: row.unit.symbol,
      unitPrice: row.unitPrice.toString(),
      value: row.lineSubtotal.toString(),
      status: row.purchaseOrder.status,
    }));
  }

  if (
    ["quotation-history", "selected-vs-lowest", "expired-quotations"].includes(
      reportId,
    )
  ) {
    const rows = await db.requestForQuotation.findMany({
      where: projectId ? { requirement: { projectId } } : {},
      include: {
        requirement: { include: { project: true } },
        quotations: { include: { supplier: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.flatMap((rfq) => {
      const valid = rfq.quotations.filter(
        (quote) => quote.validUntil >= (rfq.decidedAt ?? new Date()),
      );
      const lowest = valid.reduce<null | Prisma.Decimal>(
        (value, quote) =>
          value === null || quote.landedTotal.lt(value)
            ? quote.landedTotal
            : value,
        null,
      );
      return rfq.quotations
        .filter(
          (quote) =>
            reportId !== "expired-quotations" ||
            quote.validUntil < (rfq.decidedAt ?? new Date()),
        )
        .map((quote) => ({
          rfq: rfq.rfqNumber,
          project: rfq.requirement.project.name,
          supplier: quote.supplier.legalName,
          quotation: quote.quoteReference,
          landedTotal: quote.landedTotal.toString(),
          lowestValid: lowest?.toString() ?? "insufficient data",
          varianceFromLowest: lowest
            ? quote.landedTotal.minus(lowest).toString()
            : "insufficient data",
          selected: quote.id === rfq.recommendedQuotationId ? "YES" : "NO",
          validUntil: quote.validUntil.toISOString().slice(0, 10),
        }));
    });
  }

  if (reportId === "po-amendments") {
    const rows = await db.purchaseOrderAmendment.findMany({
      where: projectId
        ? { purchaseOrder: { rfq: { requirement: { projectId } } } }
        : {},
      include: { purchaseOrder: true },
      orderBy: [{ createdAt: "desc" }, { version: "desc" }],
      take: 1000,
    });
    return rows.map((row) => ({
      purchaseOrder: row.purchaseOrder.poNumber,
      version: row.version,
      status: row.status,
      reason: row.reason,
      proposedDelivery: row.proposedExpectedDeliveryDate
        .toISOString()
        .slice(0, 10),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    }));
  }

  if (reportId === "unregistered-suppliers") {
    const rows = await db.purchaseOrder.findMany({
      where: {
        ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
        supplier: { isGstRegistered: false },
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      include: { supplier: true },
      take: 1000,
    });
    return rows.map((row) => ({
      purchaseOrder: row.poNumber,
      supplier: row.supplier.legalName,
      accountsApproved: row.supplier.accountsApprovedUnregistered
        ? "YES"
        : "NO",
      value: row.totalAmount.toString(),
      status: row.status,
    }));
  }

  if (reportId === "supplier-performance")
    return supplierPerformanceRows(principal, filters);
  if (["budget-analytics", "project-material-cost"].includes(reportId))
    return projectBudgetRows(principal, filters);
  if (reportId === "pending-approvals") {
    const [requirements, rfqs, invoices, payments] = await Promise.all([
      db.materialRequirement.count({
        where: { ...(projectId ? { projectId } : {}), status: "SUBMITTED" },
      }),
      db.requestForQuotation.count({
        where: {
          ...(projectId ? { requirement: { projectId } } : {}),
          status: "RECOMMENDED",
        },
      }),
      hasPermission(principal, "invoice.view")
        ? db.supplierInvoice.count({ where: { status: "MD_APPROVAL_PENDING" } })
        : 0,
      hasPermission(principal, "payment.view")
        ? db.supplierPayment.count({ where: { status: "PENDING_APPROVAL" } })
        : 0,
    ]);
    return [
      { type: "Material requirements", pending: requirements },
      { type: "Quotation recommendations", pending: rfqs },
      { type: "Supplier invoices", pending: invoices },
      { type: "Supplier payments", pending: payments },
    ];
  }
  if (reportId === "procurement-trend") {
    const orders = await db.purchaseOrder.findMany({
      where: {
        ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
        status: { notIn: ["DRAFT", "CANCELLED"] },
        ...(range.from || range.to
          ? { createdAt: { gte: range.from, lte: range.to } }
          : {}),
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    const months = new Map<string, { count: number; value: Prisma.Decimal }>();
    for (const order of orders) {
      const month = order.createdAt.toISOString().slice(0, 7);
      const current = months.get(month) ?? {
        count: 0,
        value: new Prisma.Decimal(0),
      };
      current.count += 1;
      current.value = current.value.plus(order.totalAmount);
      months.set(month, current);
    }
    return [...months].map(([month, value]) => ({
      month,
      purchaseOrders: value.count,
      committedValue: value.value.toFixed(2),
    }));
  }
  if (reportId === "supplier-exposure") {
    const [suppliers, orders, invoices] = await Promise.all([
      db.supplier.findMany({
        select: { id: true, supplierCode: true, legalName: true },
      }),
      db.purchaseOrder.groupBy({
        by: ["supplierId"],
        where: { status: { notIn: ["DRAFT", "CANCELLED", "CLOSED"] } },
        _sum: { totalAmount: true },
      }),
      db.supplierInvoice.findMany({
        where: {
          status: { in: ["APPROVED", "PARTIALLY_PAID", "PAYMENT_HOLD"] },
        },
      }),
    ]);
    return suppliers
      .map((supplier) => {
        const committed =
          orders.find((row) => row.supplierId === supplier.id)?._sum
            .totalAmount ?? new Prisma.Decimal(0);
        const payable = invoices
          .filter((invoice) => invoice.supplierId === supplier.id)
          .reduce(
            (sum, invoice) =>
              sum
                .plus(invoice.approvedPayable ?? invoice.invoiceTotal)
                .plus(invoice.debitApplied)
                .minus(invoice.paidAmount)
                .minus(invoice.creditApplied)
                .minus(invoice.advanceApplied),
            new Prisma.Decimal(0),
          );
        return {
          supplierCode: supplier.supplierCode,
          supplier: supplier.legalName,
          openCommitment: committed.toFixed(2),
          outstandingPayable: payable.toFixed(2),
          totalExposure: committed.plus(payable).toFixed(2),
        };
      })
      .filter((row) => Number(row.totalExposure) !== 0);
  }
  if (reportId === "audit-exceptions") {
    requirePermission(principal, "audit.view");
    const rows = await db.auditLog.groupBy({
      by: ["entityType", "action"],
      where:
        range.from || range.to
          ? { createdAt: { gte: range.from, lte: range.to } }
          : {},
      _count: true,
      orderBy: { _count: { entityType: "desc" } },
      take: 500,
    });
    return rows.map((row) => ({
      entityType: row.entityType,
      action: row.action,
      events: row._count,
    }));
  }
  return [];
}

export async function projectBudgetRows(
  principal: AuthenticatedPrincipal,
  filters: ReportFilters = {},
) {
  requirePermission(principal, "project.view");
  const scope = await getReportingScope(principal);
  if (
    filters.projectId &&
    scope.projectIds &&
    !scope.projectIds.includes(filters.projectId)
  )
    return [];
  const projectId = scopedId(
    filters.projectId ? [filters.projectId] : scope.projectIds,
  );
  const [projects, orders, allocations, payments, revisions] =
    await Promise.all([
      db.project.findMany({
        where: projectId ? { id: projectId } : {},
        orderBy: { projectCode: "asc" },
      }),
      db.purchaseOrder.findMany({
        where: {
          ...(projectId ? { rfq: { requirement: { projectId } } } : {}),
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        select: {
          totalAmount: true,
          rfq: { select: { requirement: { select: { projectId: true } } } },
        },
      }),
      db.projectCostAllocation.groupBy({
        by: ["projectId", "workPackage"],
        where: projectId ? { projectId } : {},
        _sum: { amount: true },
      }),
      hasPermission(principal, "payment.view")
        ? db.supplierPayment.findMany({
            where: { status: "FINALIZED", invoiceId: { not: null } },
            select: { amount: true, invoiceId: true },
          })
        : [],
      db.projectBudgetRevision.findMany({
        where: projectId ? { projectId } : {},
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);
  const committed = new Map<string, number>();
  orders.forEach((row) =>
    committed.set(
      row.rfq.requirement.projectId,
      (committed.get(row.rfq.requirement.projectId) ?? 0) +
        row.totalAmount.toNumber(),
    ),
  );
  const actual = new Map<string, number>();
  allocations.forEach((row) =>
    actual.set(
      row.projectId,
      (actual.get(row.projectId) ?? 0) + (row._sum.amount?.toNumber() ?? 0),
    ),
  );
  const invoiceIds = payments
    .map((payment) => payment.invoiceId)
    .filter((id): id is string => Boolean(id));
  const invoiceLines = await db.supplierInvoiceLine.findMany({
    where: { invoiceId: { in: invoiceIds } },
    select: { id: true, invoiceId: true },
  });
  const lineInvoice = new Map(
    invoiceLines.map((line) => [line.id, line.invoiceId]),
  );
  const paidAllocations = await db.projectCostAllocation.findMany({
    where: { invoiceLineId: { in: invoiceLines.map((line) => line.id) } },
  });
  const weightsByInvoice = new Map<string, Map<string, number>>();
  for (const allocation of paidAllocations) {
    const invoiceId = lineInvoice.get(allocation.invoiceLineId);
    if (!invoiceId) continue;
    const weights =
      weightsByInvoice.get(invoiceId) ?? new Map<string, number>();
    weights.set(
      allocation.projectId,
      (weights.get(allocation.projectId) ?? 0) + allocation.amount.toNumber(),
    );
    weightsByInvoice.set(invoiceId, weights);
  }
  const paidByProject = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.invoiceId) continue;
    const weights = weightsByInvoice.get(payment.invoiceId);
    if (!weights) continue;
    const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
    if (!total) continue;
    for (const [paidProjectId, weight] of weights)
      paidByProject.set(
        paidProjectId,
        (paidByProject.get(paidProjectId) ?? 0) +
          payment.amount.toNumber() * (weight / total),
      );
  }
  return projects.map((project) => {
    const latest = revisions.find(
      (revision) => revision.projectId === project.id && !revision.workPackage,
    );
    const position = budgetPosition({
      approvedBudget: latest?.approvedBudget ?? project.procurementBudget ?? 0,
      committed: committed.get(project.id) ?? 0,
      actual: actual.get(project.id) ?? 0,
      paid: paidByProject.get(project.id) ?? 0,
    });
    return {
      projectCode: project.projectCode,
      project: project.name,
      revision: latest?.revisionNumber ?? 0,
      approvedBudget: position.approvedBudget,
      committed: position.committed,
      actual: position.actual,
      paid: position.paid,
      outstandingPayable: position.outstandingPayable,
      remainingBudget: position.remainingBudget,
      warning: position.overBudget ? "OVER BUDGET" : "",
    };
  });
}

export async function supplierPerformanceRows(
  principal: AuthenticatedPrincipal,
  filters: ReportFilters = {},
) {
  requirePermission(principal, "report.view");
  const range = dateRange(filters);
  const suppliers = await db.supplier.findMany({
    orderBy: { legalName: "asc" },
    take: 500,
  });
  const result: ReportRow[] = [];
  for (const supplier of suppliers) {
    const [quotes, pos, supplierInvoices, receiptLines, exceptions, blacklist] =
      await Promise.all([
        db.supplierQuotation.findMany({
          where: {
            supplierId: supplier.id,
            ...(range.from || range.to
              ? { quoteDate: { gte: range.from, lte: range.to } }
              : {}),
          },
          select: {
            landedTotal: true,
            recommendedFor: { select: { id: true } },
          },
        }),
        db.purchaseOrder.findMany({
          where: {
            supplierId: supplier.id,
            status: { notIn: ["DRAFT", "CANCELLED"] },
          },
          select: {
            expectedDeliveryDate: true,
            goodsReceipts: {
              where: { status: "POSTED" },
              select: {
                postedAt: true,
                lines: {
                  select: {
                    acceptedQuantity: true,
                    receivedQuantity: true,
                    damagedQuantity: true,
                    rejectedQuantity: true,
                  },
                },
              },
            },
          },
        }),
        db.supplierInvoice.findMany({
          where: { supplierId: supplier.id },
          select: { id: true, status: true },
        }),
        db.goodsReceiptLine.findMany({
          where: {
            goodsReceipt: {
              purchaseOrder: { supplierId: supplier.id },
              status: "POSTED",
            },
          },
          select: {
            acceptedQuantity: true,
            receivedQuantity: true,
            damagedQuantity: true,
            rejectedQuantity: true,
          },
        }),
        db.goodsReceiptException.findMany({
          where: {
            goodsReceiptLine: {
              goodsReceipt: { purchaseOrder: { supplierId: supplier.id } },
            },
            status: "RESOLVED",
          },
          select: { createdAt: true, updatedAt: true },
        }),
        db.supplierBlacklistEvent.findFirst({
          where: { supplierId: supplier.id },
          orderBy: { createdAt: "desc" },
        }),
      ]);
    const mismatchedInvoiceIds = new Set(
      (
        await db.invoiceMismatch.findMany({
          where: {
            invoiceId: { in: supplierInvoices.map((invoice) => invoice.id) },
          },
          select: { invoiceId: true },
          distinct: ["invoiceId"],
        })
      ).map((row) => row.invoiceId),
    );
    const invoiceCount = supplierInvoices.length;
    const accurateInvoices = supplierInvoices.filter(
      (invoice) =>
        ["VERIFIED", "APPROVED", "PARTIALLY_PAID", "PAID"].includes(
          invoice.status,
        ) && !mismatchedInvoiceIds.has(invoice.id),
    ).length;
    const prices = quotes
      .map((q) => q.landedTotal.toNumber())
      .sort((a, b) => a - b);
    const selected =
      quotes.find((q) => q.recommendedFor)?.landedTotal ?? prices[0] ?? 0;
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    const delivered = receiptLines.reduce(
      (sum, row) => sum.plus(row.receivedQuantity),
      new Prisma.Decimal(0),
    );
    const accepted = receiptLines.reduce(
      (sum, row) => sum.plus(row.acceptedQuantity),
      new Prisma.Decimal(0),
    );
    const damaged = receiptLines.reduce(
      (sum, row) => sum.plus(row.damagedQuantity).plus(row.rejectedQuantity),
      new Prisma.Decimal(0),
    );
    const onTime = pos
      .flatMap((po) =>
        po.goodsReceipts
          .filter(
            (grn) => grn.postedAt && grn.postedAt <= po.expectedDeliveryDate,
          )
          .flatMap((grn) => grn.lines),
      )
      .reduce(
        (sum, row) => sum.plus(row.acceptedQuantity),
        new Prisma.Decimal(0),
      );
    const metrics = supplierPerformance({
      selectedLandedPrice: selected,
      medianValidPrice: median,
      lowestValidPrice: prices[0] ?? 0,
      onTimeAcceptedQuantity: onTime,
      deliveredQuantity: delivered,
      accurateInvoices,
      totalInvoices: invoiceCount,
      damagedOrRejectedQuantity: damaged,
      acceptedQuantity: accepted,
      replacementResolutionHours: exceptions.map(
        (row) =>
          (row.updatedAt.getTime() - row.createdAt.getTime()) / 3_600_000,
      ),
    });
    result.push({
      supplierCode: supplier.supplierCode,
      supplier: supplier.legalName,
      gstin: supplier.gstin,
      blacklistStatus: blacklist?.blacklisted ? "BLACKLISTED" : "CLEAR",
      priceVsLowest:
        metrics.priceCompetitiveness.versusLowestPercent ?? "insufficient data",
      onTimeDelivery: metrics.onTimeDelivery.percentage ?? "insufficient data",
      onTimeNumerator: metrics.onTimeDelivery.numerator,
      onTimeDenominator: metrics.onTimeDelivery.denominator,
      invoiceAccuracy:
        metrics.invoiceAccuracy.percentage ?? "insufficient data",
      damageRate: metrics.damageRejectionRate.percentage ?? "insufficient data",
      acceptedQuality:
        metrics.acceptedQualityRate.percentage ?? "insufficient data",
      replacementHours: metrics.replacementResponseHours ?? "insufficient data",
    });
  }
  return result;
}
