import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";

type DecimalValue = Prisma.Decimal | string | number;
const D = (value: DecimalValue) => new Prisma.Decimal(value);

export type Metric = {
  numerator: string;
  denominator: string;
  percentage: string | null;
  status: "available" | "insufficient-data";
};

export function indianFinancialYear(date: Date) {
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

export function indianFinancialYearBounds(financialYear: string) {
  if (!/^\d{2}-\d{2}$/.test(financialYear))
    throw new Error("Invalid Indian financial year");
  const startYear = 2000 + Number(financialYear.slice(0, 2));
  if ((startYear + 1) % 100 !== Number(financialYear.slice(3)))
    throw new Error("Invalid Indian financial year sequence");
  return {
    start: new Date(Date.UTC(startYear, 3, 1)),
    endExclusive: new Date(Date.UTC(startYear + 1, 3, 1)),
  };
}

export function ageingBucket(daysOverdue: number) {
  if (daysOverdue <= 0) return "CURRENT" as const;
  if (daysOverdue <= 30) return "1-30" as const;
  if (daysOverdue <= 60) return "31-60" as const;
  if (daysOverdue <= 90) return "61-90" as const;
  return "90+" as const;
}

export function budgetPosition(input: {
  approvedBudget: DecimalValue;
  committed: DecimalValue;
  actual: DecimalValue;
  paid: DecimalValue;
}) {
  const budget = D(input.approvedBudget);
  const committed = D(input.committed);
  const actual = D(input.actual);
  const paid = D(input.paid);
  return {
    approvedBudget: budget.toFixed(2),
    committed: committed.toFixed(2),
    actual: actual.toFixed(2),
    paid: paid.toFixed(2),
    outstandingPayable: Prisma.Decimal.max(actual.minus(paid), 0).toFixed(2),
    remainingBudget: budget.minus(actual).toFixed(2),
    overBudget: actual.gt(budget),
  };
}

export function lowStockPosition(input: {
  currentQuantity: DecimalValue;
  minimumLevel: DecimalValue;
  reorderLevel: DecimalValue;
}) {
  const current = D(input.currentQuantity);
  const minimum = D(input.minimumLevel);
  const reorder = D(input.reorderLevel);
  return {
    currentQuantity: current.toFixed(3),
    temporaryNegativeQuantity: current.isNegative()
      ? current.abs().toFixed(3)
      : "0.000",
    shortage: Prisma.Decimal.max(reorder.minus(current), 0).toFixed(3),
    low: current.lt(minimum),
    reorderRequired: current.lte(reorder),
  };
}

export function performanceMetric(
  numerator: DecimalValue,
  denominator: DecimalValue,
): Metric {
  const top = D(numerator);
  const bottom = D(denominator);
  return {
    numerator: top.toString(),
    denominator: bottom.toString(),
    percentage: bottom.gt(0)
      ? top.div(bottom).mul(100).toDecimalPlaces(2).toFixed(2)
      : null,
    status: bottom.gt(0) ? "available" : "insufficient-data",
  };
}

export function supplierPerformance(input: {
  selectedLandedPrice: DecimalValue;
  medianValidPrice: DecimalValue;
  lowestValidPrice: DecimalValue;
  onTimeAcceptedQuantity: DecimalValue;
  deliveredQuantity: DecimalValue;
  accurateInvoices: DecimalValue;
  totalInvoices: DecimalValue;
  damagedOrRejectedQuantity: DecimalValue;
  acceptedQuantity: DecimalValue;
  replacementResolutionHours: readonly number[];
}) {
  const selected = D(input.selectedLandedPrice);
  const median = D(input.medianValidPrice);
  const lowest = D(input.lowestValidPrice);
  return {
    priceCompetitiveness: {
      selected: selected.toFixed(2),
      median: median.toFixed(2),
      lowest: lowest.toFixed(2),
      versusMedianPercent: median.gt(0)
        ? selected.minus(median).div(median).mul(100).toFixed(2)
        : null,
      versusLowestPercent: lowest.gt(0)
        ? selected.minus(lowest).div(lowest).mul(100).toFixed(2)
        : null,
      status:
        median.gt(0) && lowest.gt(0)
          ? ("available" as const)
          : ("insufficient-data" as const),
    },
    onTimeDelivery: performanceMetric(
      input.onTimeAcceptedQuantity,
      input.deliveredQuantity,
    ),
    invoiceAccuracy: performanceMetric(
      input.accurateInvoices,
      input.totalInvoices,
    ),
    damageRejectionRate: performanceMetric(
      input.damagedOrRejectedQuantity,
      input.deliveredQuantity,
    ),
    acceptedQualityRate: performanceMetric(
      input.acceptedQuantity,
      input.deliveredQuantity,
    ),
    replacementResponseHours: input.replacementResolutionHours.length
      ? (
          input.replacementResolutionHours.reduce(
            (sum, value) => sum + value,
            0,
          ) / input.replacementResolutionHours.length
        ).toFixed(1)
      : null,
  };
}

export function excludesReversed<
  T extends { id: string; reversalOfId: string | null },
>(rows: readonly T[]) {
  const reversed = new Set(
    rows
      .map((row) => row.reversalOfId)
      .filter((id): id is string => Boolean(id)),
  );
  return rows.filter((row) => !row.reversalOfId && !reversed.has(row.id));
}

export function sanitizeSpreadsheetCell(value: unknown) {
  const text = String(value ?? "");
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function exportIdempotencyKey(input: {
  userId: string;
  reportType: string;
  format: string;
  filters: unknown;
  minute?: string;
}) {
  const minute = input.minute ?? new Date().toISOString().slice(0, 16);
  return createHash("sha256")
    .update(JSON.stringify({ ...input, minute }))
    .digest("hex");
}

export const reportColumnPermissions = {
  gstin: "invoice.view",
  taxableValue: "invoice.view",
  taxAmount: "invoice.view",
  payable: "payment.view",
  employeeEmail: "user.manage",
} as const;
