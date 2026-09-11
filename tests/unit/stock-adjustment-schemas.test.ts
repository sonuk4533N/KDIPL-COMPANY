import { describe, expect, it } from "vitest";

import {
  stockAdjustmentDecisionSchema,
  stockAdjustmentDraftSchema,
} from "../../src/features/inventory/stock-adjustment-schemas";

const id = "11111111-1111-4111-8111-111111111111";

describe("stock adjustment schemas", () => {
  it("accepts a documented positive adjustment", () => {
    expect(
      stockAdjustmentDraftSchema.parse({
        locationId: id,
        materialId: "22222222-2222-4222-8222-222222222222",
        unitId: "33333333-3333-4333-8333-333333333333",
        direction: "OUT",
        quantity: "2.500",
        reason: "Damaged stock confirmed during inspection",
      }),
    ).toMatchObject({ direction: "OUT", quantity: 2.5 });
  });

  it("rejects missing evidence and non-positive quantities", () => {
    const base = {
      locationId: id,
      materialId: "22222222-2222-4222-8222-222222222222",
      unitId: "33333333-3333-4333-8333-333333333333",
      direction: "IN",
      quantity: 1,
      reason: "Valid reason",
    };
    expect(
      stockAdjustmentDraftSchema.safeParse({ ...base, quantity: 0 }).success,
    ).toBe(false);
    expect(
      stockAdjustmentDraftSchema.safeParse({ ...base, reason: "bad" }).success,
    ).toBe(false);
  });

  it("requires approval or rejection notes", () => {
    expect(
      stockAdjustmentDecisionSchema.safeParse({
        stockAdjustmentId: id,
        decision: "APPROVE",
        notes: "ok",
      }).success,
    ).toBe(false);
    expect(
      stockAdjustmentDecisionSchema.safeParse({
        stockAdjustmentId: id,
        decision: "REJECT",
        notes: "Evidence does not support this correction",
      }).success,
    ).toBe(true);
  });
});
