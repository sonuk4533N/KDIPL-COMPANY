import { z } from "zod";

export const stockAdjustmentDraftSchema = z.object({
  locationId: z.uuid(),
  materialId: z.uuid(),
  unitId: z.uuid(),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().positive().max(999_999_999),
  reason: z.string().trim().min(5).max(1000),
});

export const stockAdjustmentIdSchema = z.object({
  stockAdjustmentId: z.uuid(),
});

export const stockAdjustmentDecisionSchema = stockAdjustmentIdSchema.extend({
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().trim().min(3).max(1000),
});

export const stockAdjustmentCancelSchema = stockAdjustmentIdSchema.extend({
  reason: z.string().trim().min(3).max(1000),
});

export type StockAdjustmentDraftInput = z.infer<
  typeof stockAdjustmentDraftSchema
>;
export type StockAdjustmentDecisionInput = z.infer<
  typeof stockAdjustmentDecisionSchema
>;
export type StockAdjustmentCancelInput = z.infer<
  typeof stockAdjustmentCancelSchema
>;
