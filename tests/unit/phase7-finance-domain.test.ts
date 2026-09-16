import { describe, expect, it } from "vitest";
import {
  assertInvoiceTransition,
  calculateDueDate,
  calculateInvoiceLine,
  calculateInvoiceTotal,
  indianFinancialYear,
  normalizeSupplierInvoiceNumber,
  payableBalance,
} from "@/server/finance/domain";

describe("Phase 7 finance domain", () => {
  it("calculates intra-state GST, taxable freight, discounts and TDS", () => {
    const line = calculateInvoiceLine({
      quantity: "10",
      unitPrice: "100",
      discountBeforeTax: "50",
      discountAfterTax: "10",
      freight: "50",
      freightTaxable: true,
      gstRate: "18",
      tdsRate: "2",
      supplierState: "Haryana",
      placeOfSupply: "Haryana",
    });
    expect(line.taxableValue.toString()).toBe("1000");
    expect(line.cgst.toString()).toBe("90");
    expect(line.sgst.toString()).toBe("90");
    expect(line.igst.toString()).toBe("0");
    expect(line.tds.toString()).toBe("20");
    expect(line.supplierPayable.toString()).toBe("1150");
  });

  it("uses IGST for inter-state purchases and excludes RCM tax from supplier payable", () => {
    const line = calculateInvoiceLine({
      quantity: "2",
      unitPrice: "500",
      freight: "100",
      freightTaxable: false,
      gstRate: "18",
      reverseCharge: true,
      supplierState: "Delhi",
      placeOfSupply: "Haryana",
    });
    expect(line.igst.toString()).toBe("180");
    expect(line.supplierPayable.toString()).toBe("1100");
  });

  it("supports mixed rates and server-controlled rounding", () => {
    const lines = [
      calculateInvoiceLine({
        quantity: 1,
        unitPrice: 100,
        gstRate: 5,
        supplierState: "Delhi",
        placeOfSupply: "Delhi",
      }),
      calculateInvoiceLine({
        quantity: 1,
        unitPrice: 200,
        gstRate: 18,
        supplierState: "Delhi",
        placeOfSupply: "Haryana",
      }),
    ];
    const total = calculateInvoiceTotal(lines, "-0.50");
    expect(total.cgst.toString()).toBe("2.5");
    expect(total.sgst.toString()).toBe("2.5");
    expect(total.igst.toString()).toBe("36");
    expect(total.total.toString()).toBe("340.5");
  });

  it("calculates due dates without local-time drift", () => {
    expect(
      calculateDueDate(new Date("2026-04-01T18:30:00Z"), 30).toISOString(),
    ).toBe("2026-05-01T00:00:00.000Z");
  });

  it("uses the Indian financial year", () => {
    expect(indianFinancialYear(new Date("2026-03-31T12:00:00Z")).code).toBe(
      "25-26",
    );
    expect(indianFinancialYear(new Date("2026-04-01T00:00:00Z")).code).toBe(
      "26-27",
    );
  });

  it("normalizes supplier invoice numbers for duplicate prevention", () => {
    expect(normalizeSupplierInvoiceNumber(" inv / 001-a ")).toBe("INV001A");
  });

  it("keeps partial-payment, credit, debit and advance balances exact", () => {
    expect(
      payableBalance("1000", ["250"], ["100"], ["50"], ["200"]).toString(),
    ).toBe("500");
    expect(() => payableBalance("100", ["101"])).toThrow(/exceed/);
  });

  it("enforces the invoice workflow", () => {
    expect(() =>
      assertInvoiceTransition("DRAFT", "UNDER_REVIEW"),
    ).not.toThrow();
    expect(() => assertInvoiceTransition("DRAFT", "APPROVED")).toThrow(
      /not allowed/,
    );
  });
});
