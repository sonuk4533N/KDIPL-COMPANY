import { describe, expect, it } from "vitest";

import { rfqDraftSchema } from "@/features/procurement/rfq-schemas";

const validDraft = {
  requirementId: "11111111-1111-4111-8111-111111111111",
  responseDueDate: "2027-01-15",
  supplierIds: ["22222222-2222-4222-8222-222222222222"],
  notes: "Quote delivery and tax separately.",
};

describe("Phase 4 RFQ draft validation", () => {
  it("accepts a valid draft", () => {
    expect(rfqDraftSchema.parse(validDraft)).toMatchObject(validDraft);
  });

  it("requires at least one supplier and a valid calendar date", () => {
    expect(
      rfqDraftSchema.safeParse({ ...validDraft, supplierIds: [] }).success,
    ).toBe(false);
    expect(
      rfqDraftSchema.safeParse({
        ...validDraft,
        responseDueDate: "2027-02-30",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate suppliers", () => {
    const supplierId = validDraft.supplierIds[0];
    const result = rfqDraftSchema.safeParse({
      ...validDraft,
      supplierIds: [supplierId, supplierId],
    });
    expect(result.success).toBe(false);
  });
});
