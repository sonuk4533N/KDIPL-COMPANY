import { describe, expect, it } from "vitest";

import {
  calculateReceiptQuantities,
  canPostGoodsReceipt,
  stockDirectionForTransaction,
} from "../../src/server/inventory/domain";

describe("Phase 5 inventory domain", () => {
  it("supports partial receipt with accepted, damaged, and rejected quantities", () => {
    expect(
      calculateReceiptQuantities({
        orderedQuantity: 500,
        previouslyReceivedQuantity: 100,
        acceptedQuantity: 250,
        damagedQuantity: 25,
        rejectedQuantity: 25,
      }),
    ).toEqual({
      receivedQuantity: 300,
      cumulativeReceivedQuantity: 400,
      remainingQuantity: 100,
    });
  });

  it("rejects cumulative over-receipt", () => {
    expect(() =>
      calculateReceiptQuantities({
        orderedQuantity: 500,
        previouslyReceivedQuantity: 450,
        acceptedQuantity: 60,
        damagedQuantity: 0,
        rejectedQuantity: 0,
      }),
    ).toThrow("Receipt exceeds the purchase-order quantity.");
  });

  it("maps stock-affecting transaction direction", () => {
    expect(stockDirectionForTransaction("RECEIPT")).toBe("IN");
    expect(stockDirectionForTransaction("ISSUE")).toBe("OUT");
  });

  it("does not permit stock posting from the current draft-only PO state", () => {
    expect(canPostGoodsReceipt("DRAFT")).toBe(false);
    expect(canPostGoodsReceipt("ISSUED")).toBe(true);
  });
});
