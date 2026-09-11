import { z } from "zod";

export const stockCountDraftSchema = z.object({
  locationId: z.uuid(),
  materialId: z.uuid(),
  unitId: z.uuid(),
  countedAt: z.coerce
    .date()
    .refine(
      (value) => value <= new Date(),
      "Count time cannot be in the future.",
    ),
  countedQuantity: z.coerce.number().nonnegative().max(999_999_999),
  notes: z.string().trim().max(1000).optional(),
  lineNotes: z.string().trim().max(500).optional(),
});

export const stockCountIdSchema = z.object({ stockCountId: z.uuid() });

export const stockCountDecisionSchema = stockCountIdSchema.extend({
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().trim().min(3).max(1000),
});

export const stockCountCancelSchema = stockCountIdSchema.extend({
  reason: z.string().trim().min(3).max(1000),
});

export type StockCountDraftInput = z.infer<typeof stockCountDraftSchema>;
export type StockCountDecisionInput = z.infer<typeof stockCountDecisionSchema>;
export type StockCountCancelInput = z.infer<typeof stockCountCancelSchema>;
