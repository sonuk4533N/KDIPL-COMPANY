import { describe, expect, it } from "vitest";

import {
  stockTransferCancelSchema,
  stockTransferDraftSchema,
} from "../../src/features/inventory/stock-transfer-schemas";

const sourceLocationId = "11111111-1111-4111-8111-111111111111";
const destinationLocationId = "22222222-2222-4222-8222-222222222222";

describe("stock transfer schemas", () => {
  it("accepts a positive transfer between different locations", () => {
    expect(
      stockTransferDraftSchema.parse({
        sourceLocationId,
        destinationLocationId,
        materialId: "33333333-3333-4333-8333-333333333333",
        unitId: "44444444-4444-4444-8444-444444444444",
        quantity: "4.250",
        purpose: "ROUTINE",
      }),
    ).toMatchObject({ quantity: 4.25, purpose: "ROUTINE" });
  });

  it("rejects a non-positive quantity or identical destination", () => {
    const base = {
      sourceLocationId,
      destinationLocationId,
      materialId: "33333333-3333-4333-8333-333333333333",
      unitId: "44444444-4444-4444-8444-444444444444",
      quantity: 1,
      purpose: "PROJECT_CLOSE",
    };
    expect(
      stockTransferDraftSchema.safeParse({ ...base, quantity: 0 }).success,
    ).toBe(false);
    expect(
      stockTransferDraftSchema.safeParse({
        ...base,
        destinationLocationId: sourceLocationId,
      }).success,
    ).toBe(false);
  });

  it("requires cancellation evidence", () => {
    expect(
      stockTransferCancelSchema.safeParse({
        stockTransferId: sourceLocationId,
        reason: "no",
      }).success,
    ).toBe(false);
  });
});
