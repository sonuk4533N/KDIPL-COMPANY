import { describe, expect, it } from "vitest";

import {
  calculateReceiptQuantities,
  canPostGoodsReceipt,
  purchaseOrderStatusAfterReceipt,
  stockDirectionForTransaction,
} from "../../src/server/inventory/domain";

describe("Phase 5 inventory domain", () => {
  it("supports partial receipt with accepted, damaged, and rejected quantities", () => {
    expect(
      calculateReceiptQuantities({
        orderedQuantity: 500,
        previouslyAcceptedQuantity: 100,
        previouslyDamagedQuantity: 0,
        previouslyRejectedQuantity: 0,
        acceptedQuantity: 250,
        damagedQuantity: 25,
        rejectedQuantity: 25,
      }),
    ).toEqual({
      receivedQuantity: 300,
      cumulativeAcceptedQuantity: 350,
      cumulativeNonConformingQuantity: 50,
      remainingAcceptableQuantity: 150,
      replacementAllowance: 0,
    });
  });

  it("rejects accepted quantity above the purchase-order quantity", () => {
    expect(() =>
      calculateReceiptQuantities({
        orderedQuantity: 500,
        previouslyAcceptedQuantity: 450,
        previouslyDamagedQuantity: 0,
        previouslyRejectedQuantity: 0,
        acceptedQuantity: 60,
        damagedQuantity: 0,
        rejectedQuantity: 0,
      }),
    ).toThrow("Accepted quantity exceeds the purchase-order quantity.");
  });

  it("allows replacement delivery only for previously damaged or rejected quantity", () => {
    expect(
      calculateReceiptQuantities({
        orderedQuantity: 100,
        previouslyAcceptedQuantity: 80,
        previouslyDamagedQuantity: 10,
        previouslyRejectedQuantity: 10,
        acceptedQuantity: 20,
        damagedQuantity: 0,
        rejectedQuantity: 0,
      }),
    ).toMatchObject({
      cumulativeAcceptedQuantity: 100,
      remainingAcceptableQuantity: 0,
      replacementAllowance: 20,
    });
  });

  it("maps stock-affecting transaction direction", () => {
    expect(stockDirectionForTransaction("RECEIPT")).toBe("IN");
    expect(stockDirectionForTransaction("ISSUE")).toBe("OUT");
  });

  it("permits GRN processing once the purchase order is issued", () => {
    expect(canPostGoodsReceipt("DRAFT")).toBe(false);
    expect(canPostGoodsReceipt("ISSUED")).toBe(true);
    expect(canPostGoodsReceipt("ACCEPTED")).toBe(true);
    expect(canPostGoodsReceipt("PARTIALLY_RECEIVED")).toBe(true);
  });

  it("moves the PO to received only when the ordered quantity is accepted", () => {
    expect(purchaseOrderStatusAfterReceipt(100, 40)).toBe("PARTIALLY_RECEIVED");
    expect(purchaseOrderStatusAfterReceipt(100, 100)).toBe("RECEIVED");
  });
});
