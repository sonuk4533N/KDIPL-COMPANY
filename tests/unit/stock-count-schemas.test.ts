import { describe, expect, it } from "vitest";

import {
  stockCountDecisionSchema,
  stockCountDraftSchema,
} from "../../src/features/inventory/stock-count-schemas";

const locationId = "11111111-1111-4111-8111-111111111111";
const materialId = "22222222-2222-4222-8222-222222222222";
const unitId = "33333333-3333-4333-8333-333333333333";

describe("stock count schemas", () => {
  it("accepts zero stock and a past count time", () => {
    expect(
      stockCountDraftSchema.parse({
        locationId,
        materialId,
        unitId,
        countedAt: "2026-09-11T10:30:00.000Z",
        countedQuantity: "0",
        notes: "Witnessed shelf-by-shelf count",
      }),
    ).toMatchObject({ countedQuantity: 0 });
  });

  it("rejects negative quantities and future count times", () => {
    const base = {
      locationId,
      materialId,
      unitId,
      countedAt: new Date(Date.now() - 60_000),
      countedQuantity: 1,
    };
    expect(
      stockCountDraftSchema.safeParse({ ...base, countedQuantity: -0.001 })
        .success,
    ).toBe(false);
    expect(
      stockCountDraftSchema.safeParse({
        ...base,
        countedAt: new Date(Date.now() + 60_000),
      }).success,
    ).toBe(false);
  });

  it("requires decision evidence", () => {
    expect(
      stockCountDecisionSchema.safeParse({
        stockCountId: locationId,
        decision: "APPROVE",
        notes: "ok",
      }).success,
    ).toBe(false);
    expect(
      stockCountDecisionSchema.safeParse({
        stockCountId: locationId,
        decision: "REJECT",
        notes: "Count sheet is incomplete",
      }).success,
    ).toBe(true);
  });
});
