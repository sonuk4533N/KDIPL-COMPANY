import { describe, expect, it } from "vitest";

import {
  materialIssueCancelSchema,
  materialIssueDraftSchema,
} from "../../src/features/inventory/material-issue-schemas";

const id = "9f53cb95-7f87-46ef-9eec-89a181dc5cc7";

describe("material issue validation", () => {
  it("accepts a positive issue against trusted identifiers", () => {
    expect(
      materialIssueDraftSchema.parse({
        sourceLocationId: id,
        materialId: id,
        unitId: id,
        siteId: id,
        quantity: "2.500",
        purpose: "Install on level three",
      }),
    ).toMatchObject({ quantity: 2.5, purpose: "Install on level three" });
  });

  it("rejects zero or negative issues and empty purposes", () => {
    for (const quantity of ["0", "-1"]) {
      expect(
        materialIssueDraftSchema.safeParse({
          sourceLocationId: id,
          materialId: id,
          unitId: id,
          siteId: id,
          quantity,
          purpose: "",
        }).success,
      ).toBe(false);
    }
  });

  it("requires a meaningful cancellation reason", () => {
    expect(
      materialIssueCancelSchema.safeParse({
        materialIssueId: id,
        reason: "no",
      }).success,
    ).toBe(false);
    expect(
      materialIssueCancelSchema.safeParse({
        materialIssueId: id,
        reason: "No longer required",
      }).success,
    ).toBe(true);
  });
});
