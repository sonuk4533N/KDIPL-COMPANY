import { describe, expect, it } from "vitest";

import {
  rfqDecisionSchema,
  rfqDraftSchema,
  rfqRecommendationSchema,
  supplierQuotationSchema,
} from "@/features/procurement/rfq-schemas";

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

describe("Phase 4 commercial workflow validation", () => {
  const quotation = {
    rfqId: "11111111-1111-4111-8111-111111111111",
    supplierId: "22222222-2222-4222-8222-222222222222",
    quoteReference: "SUP-Q-001",
    quoteDate: "2027-01-10",
    validUntil: "2027-02-10",
    offeredDeliveryDate: "2027-01-25",
    paymentTerms: "30 days from invoice",
    gstRate: "18",
    freightAmount: "250.50",
    linePrices: [
      {
        requirementLineId: "33333333-3333-4333-8333-333333333333",
        unitPrice: "125.75",
      },
    ],
  };

  it("accepts a complete supplier quotation and rejects invalid commercial dates", () => {
    expect(supplierQuotationSchema.safeParse(quotation).success).toBe(true);
    expect(
      supplierQuotationSchema.safeParse({
        ...quotation,
        validUntil: "2027-01-09",
      }).success,
    ).toBe(false);
    expect(
      supplierQuotationSchema.safeParse({
        ...quotation,
        offeredDeliveryDate: "2027-01-09",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate material prices and out-of-range GST", () => {
    expect(
      supplierQuotationSchema.safeParse({
        ...quotation,
        linePrices: [quotation.linePrices[0], quotation.linePrices[0]],
      }).success,
    ).toBe(false);
    expect(
      supplierQuotationSchema.safeParse({ ...quotation, gstRate: "100.01" })
        .success,
    ).toBe(false);
  });

  it("requires reasons for recommendations, rejection, and send-back", () => {
    expect(
      rfqRecommendationSchema.safeParse({
        rfqId: quotation.rfqId,
        quotationId: "44444444-4444-4444-8444-444444444444",
        reason: "",
      }).success,
    ).toBe(false);
    for (const decision of ["REJECT", "SEND_BACK"] as const) {
      expect(
        rfqDecisionSchema.safeParse({
          rfqId: quotation.rfqId,
          decision,
        }).success,
      ).toBe(false);
    }
    expect(
      rfqDecisionSchema.safeParse({
        rfqId: quotation.rfqId,
        decision: "APPROVE",
      }).success,
    ).toBe(true);
  });
});
