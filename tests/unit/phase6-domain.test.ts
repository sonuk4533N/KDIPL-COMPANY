import { describe, expect, it } from "vitest";

import {
  assertSufficientStock,
  canAcknowledgeMaterialIssue,
  canDispatchTransfer,
  canPostAdjustment,
  canPostMaterialIssue,
  canPostStockCount,
  canReceiveTransfer,
  stockCountVariance,
  validateIssuedMaterialReconciliation,
} from "../../src/server/inventory/phase6-domain";

describe("Phase 6 stock movement domain", () => {
  it("prevents movements that would create negative stock", () => {
    expect(() => assertSufficientStock(25, 30)).toThrow(
      "Insufficient stock for this movement.",
    );
    expect(() => assertSufficientStock(25, 25)).not.toThrow();
  });

  it("allows issue posting only from draft and acknowledgment only after posting", () => {
    expect(canPostMaterialIssue("DRAFT")).toBe(true);
    expect(canPostMaterialIssue("POSTED")).toBe(false);
    expect(canAcknowledgeMaterialIssue("POSTED")).toBe(true);
    expect(canAcknowledgeMaterialIssue("ACKNOWLEDGED")).toBe(false);
  });

  it("keeps transfer stock in transit between dispatch and receipt", () => {
    expect(canDispatchTransfer("DRAFT")).toBe(true);
    expect(canDispatchTransfer("DISPATCHED")).toBe(false);
    expect(canReceiveTransfer("DISPATCHED")).toBe(true);
    expect(canReceiveTransfer("RECEIVED")).toBe(false);
  });

  it("derives physical-count adjustment direction from book variance", () => {
    expect(stockCountVariance(100, 92)).toEqual({
      varianceQuantity: -8,
      transactionType: "ADJUSTMENT_OUT",
      transactionQuantity: 8,
    });
    expect(stockCountVariance(100, 105)).toEqual({
      varianceQuantity: 5,
      transactionType: "ADJUSTMENT_IN",
      transactionQuantity: 5,
    });
    expect(stockCountVariance(100, 100)).toEqual({
      varianceQuantity: 0,
      transactionType: null,
      transactionQuantity: 0,
    });
  });

  it("does not allow issued-material reconciliation above issued quantity", () => {
    expect(
      validateIssuedMaterialReconciliation({
        issuedQuantity: 100,
        consumedQuantity: 70,
        returnedQuantity: 10,
        wastageQuantity: 5,
        scrapQuantity: 5,
      }),
    ).toEqual({ reconciledQuantity: 90, remainingQuantity: 10 });

    expect(() =>
      validateIssuedMaterialReconciliation({
        issuedQuantity: 100,
        consumedQuantity: 80,
        returnedQuantity: 10,
        wastageQuantity: 10,
        scrapQuantity: 5,
      }),
    ).toThrow("Issued-material reconciliation exceeds issued quantity.");
  });

  it("requires approval before posting adjustments and physical counts", () => {
    expect(canPostAdjustment("SUBMITTED")).toBe(false);
    expect(canPostAdjustment("APPROVED")).toBe(true);
    expect(canPostStockCount("SUBMITTED")).toBe(false);
    expect(canPostStockCount("APPROVED")).toBe(true);
  });
});
