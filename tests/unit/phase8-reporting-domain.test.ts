import { describe, expect, it } from "vitest";

import {
  ageingBucket,
  budgetPosition,
  excludesReversed,
  indianFinancialYear,
  indianFinancialYearBounds,
  lowStockPosition,
  performanceMetric,
  reportColumnPermissions,
  sanitizeSpreadsheetCell,
  supplierPerformance,
} from "@/features/reporting/reporting-domain";
import { toCsv, toXlsx } from "@/server/finance/report-export";

describe("Phase 8 reporting formulas", () => {
  it("uses April-to-March Indian financial-year boundaries", () => {
    expect(indianFinancialYear(new Date("2026-03-31T23:59:59.000Z"))).toBe(
      "25-26",
    );
    expect(indianFinancialYear(new Date("2026-04-01T00:00:00.000Z"))).toBe(
      "26-27",
    );
    expect(indianFinancialYearBounds("26-27")).toEqual({
      start: new Date("2026-04-01T00:00:00.000Z"),
      endExclusive: new Date("2027-04-01T00:00:00.000Z"),
    });
  });

  it("assigns deterministic invoice ageing buckets", () => {
    expect([-2, 1, 31, 61, 91].map(ageingBucket)).toEqual([
      "CURRENT",
      "1-30",
      "31-60",
      "61-90",
      "90+",
    ]);
  });

  it("distinguishes commitment, actual, paid and remaining budget", () => {
    expect(
      budgetPosition({
        approvedBudget: "1000",
        committed: "800",
        actual: "900",
        paid: "400",
      }),
    ).toEqual({
      approvedBudget: "1000.00",
      committed: "800.00",
      actual: "900.00",
      paid: "400.00",
      outstandingPayable: "500.00",
      remainingBudget: "100.00",
      overBudget: false,
    });
    expect(
      budgetPosition({
        approvedBudget: 100,
        committed: 120,
        actual: 101,
        paid: 0,
      }).overBudget,
    ).toBe(true);
  });

  it("calculates project/location low stock without creating purchases", () => {
    expect(
      lowStockPosition({
        currentQuantity: "5",
        minimumLevel: "10",
        reorderLevel: "20",
      }),
    ).toEqual({
      currentQuantity: "5.000",
      temporaryNegativeQuantity: "0.000",
      shortage: "15.000",
      low: true,
      reorderRequired: true,
    });
    expect(
      lowStockPosition({
        currentQuantity: "-2",
        minimumLevel: "10",
        reorderLevel: "20",
      }).temporaryNegativeQuantity,
    ).toBe("2.000");
  });

  it("exposes supplier metric numerator and denominator and avoids misleading zeros", () => {
    expect(performanceMetric(8, 10)).toEqual({
      numerator: "8",
      denominator: "10",
      percentage: "80.00",
      status: "available",
    });
    expect(performanceMetric(0, 0).percentage).toBeNull();
    const metrics = supplierPerformance({
      selectedLandedPrice: 110,
      medianValidPrice: 100,
      lowestValidPrice: 90,
      onTimeAcceptedQuantity: 8,
      deliveredQuantity: 10,
      accurateInvoices: 3,
      totalInvoices: 4,
      damagedOrRejectedQuantity: 1,
      acceptedQuantity: 9,
      replacementResolutionHours: [12, 24],
    });
    expect(metrics.priceCompetitiveness.versusLowestPercent).toBe("22.22");
    expect(metrics.replacementResponseHours).toBe("18.0");
  });

  it("excludes originals and reversing entries as a pair", () => {
    expect(
      excludesReversed([
        { id: "a", reversalOfId: null },
        { id: "b", reversalOfId: "a" },
        { id: "c", reversalOfId: null },
      ]),
    ).toEqual([{ id: "c", reversalOfId: null }]);
  });

  it("prevents spreadsheet formula injection in CSV and XLSX", () => {
    expect(sanitizeSpreadsheetCell(" =SUM(A1:A2)")).toBe("' =SUM(A1:A2)");
    expect(toCsv([{ supplier: "+cmd|' /C calc'!A0" }])).toContain("'+cmd");
    expect(toXlsx([{ supplier: "@unsafe" }]).toString("binary")).not.toContain(
      "<t>@unsafe</t>",
    );
  });

  it("maps sensitive columns to explicit permissions", () => {
    expect(reportColumnPermissions.gstin).toBe("invoice.view");
    expect(reportColumnPermissions.employeeEmail).toBe("user.manage");
  });
});
