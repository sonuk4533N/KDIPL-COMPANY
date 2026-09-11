import { z } from "zod";

export const materialReconciliationDraftSchema = z
  .object({
    materialIssueLineId: z.uuid(),
    returnLocationId: z.uuid().optional(),
    purpose: z.enum(["ROUTINE", "PROJECT_CLOSE"]),
    consumedQuantity: z.coerce.number().nonnegative().max(999_999_999),
    returnedQuantity: z.coerce.number().nonnegative().max(999_999_999),
    wastageQuantity: z.coerce.number().nonnegative().max(999_999_999),
    scrapQuantity: z.coerce.number().nonnegative().max(999_999_999),
    notes: z.string().trim().min(3).max(1000),
  })
  .superRefine((value, context) => {
    const total =
      value.consumedQuantity +
      value.returnedQuantity +
      value.wastageQuantity +
      value.scrapQuantity;
    if (total <= 0) {
      context.addIssue({
        code: "custom",
        path: ["consumedQuantity"],
        message: "Enter at least one reconciliation quantity.",
      });
    }
    if (value.returnedQuantity > 0 && !value.returnLocationId) {
      context.addIssue({
        code: "custom",
        path: ["returnLocationId"],
        message: "Select where unused material will be returned.",
      });
    }
    if (value.returnedQuantity === 0 && value.returnLocationId) {
      context.addIssue({
        code: "custom",
        path: ["returnLocationId"],
        message: "A return location requires a returned quantity.",
      });
    }
  });

export const materialReconciliationIdSchema = z.object({
  materialReconciliationId: z.uuid(),
});

export const materialReconciliationCancelSchema =
  materialReconciliationIdSchema.extend({
    reason: z.string().trim().min(3).max(1000),
  });

export type MaterialReconciliationDraftInput = z.infer<
  typeof materialReconciliationDraftSchema
>;
export type MaterialReconciliationCancelInput = z.infer<
  typeof materialReconciliationCancelSchema
>;
