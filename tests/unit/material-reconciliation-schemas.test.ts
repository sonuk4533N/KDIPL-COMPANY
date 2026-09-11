import { describe, expect, it } from "vitest";

import { materialReconciliationDraftSchema } from "../../src/features/inventory/material-reconciliation-schemas";

const lineId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";

describe("material reconciliation schemas", () => {
  it("accepts consumption, return, wastage, and scrap quantities", () => {
    expect(
      materialReconciliationDraftSchema.parse({
        materialIssueLineId: lineId,
        returnLocationId: locationId,
        purpose: "PROJECT_CLOSE",
        consumedQuantity: "5",
        returnedQuantity: "2",
        wastageQuantity: "1",
        scrapQuantity: "1",
        notes: "Final signed project-close disposition",
      }),
    ).toMatchObject({
      consumedQuantity: 5,
      returnedQuantity: 2,
      purpose: "PROJECT_CLOSE",
    });
  });

  it("requires a positive total and return location consistency", () => {
    const base = {
      materialIssueLineId: lineId,
      purpose: "ROUTINE",
      consumedQuantity: 0,
      returnedQuantity: 0,
      wastageQuantity: 0,
      scrapQuantity: 0,
      notes: "Routine reconciliation evidence",
    };
    expect(materialReconciliationDraftSchema.safeParse(base).success).toBe(
      false,
    );
    expect(
      materialReconciliationDraftSchema.safeParse({
        ...base,
        returnedQuantity: 1,
      }).success,
    ).toBe(false);
    expect(
      materialReconciliationDraftSchema.safeParse({
        ...base,
        consumedQuantity: 1,
        returnLocationId: locationId,
      }).success,
    ).toBe(false);
  });
});
