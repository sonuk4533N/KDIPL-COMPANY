import { describe, expect, it } from "vitest";

import {
  requirementDecisionSchema,
  requirementDraftSchema,
} from "@/features/requirements/requirement-schemas";

const validDraft = {
  projectId: "11111111-1111-4111-8111-111111111111",
  siteId: "22222222-2222-4222-8222-222222222222",
  neededBy: "2026-09-15",
  purpose: "Electrical rough-in materials",
  notes: "Coordinate delivery with the site supervisor.",
  lines: [
    {
      materialId: "33333333-3333-4333-8333-333333333333",
      quantity: "125.500",
      notes: "FRLS cable only",
    },
  ],
};

describe("Phase 3 material requirement validation", () => {
  it("accepts a scoped draft with precise positive quantities", () => {
    expect(requirementDraftSchema.parse(validDraft)).toMatchObject(validDraft);
  });

  it.each(["0", "-1", "1.0001", "1e3", "1000000000000000"])(
    "rejects unsupported quantity %s",
    (quantity) => {
      const result = requirementDraftSchema.safeParse({
        ...validDraft,
        lines: [{ ...validDraft.lines[0], quantity }],
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects duplicate materials in one requirement", () => {
    const result = requirementDraftSchema.safeParse({
      ...validDraft,
      lines: [validDraft.lines[0], { ...validDraft.lines[0], quantity: "2" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["lines", 1, "materialId"],
          message: "Each material can appear only once.",
        }),
      );
    }
  });

  it("rejects impossible calendar dates and empty line sets", () => {
    expect(
      requirementDraftSchema.safeParse({
        ...validDraft,
        neededBy: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      requirementDraftSchema.safeParse({ ...validDraft, lines: [] }).success,
    ).toBe(false);
  });

  it("requires a reason for rejection and send-back decisions", () => {
    const requirementId = "11111111-1111-4111-8111-111111111111";
    expect(
      requirementDecisionSchema.safeParse({
        requirementId,
        decision: "APPROVE",
      }).success,
    ).toBe(true);
    for (const decision of ["REJECT", "SEND_BACK"] as const) {
      expect(
        requirementDecisionSchema.safeParse({ requirementId, decision })
          .success,
      ).toBe(false);
      expect(
        requirementDecisionSchema.safeParse({
          requirementId,
          decision,
          reason: "Clarify the requested quantity.",
        }).success,
      ).toBe(true);
    }
  });
});
