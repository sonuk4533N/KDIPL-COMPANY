import { z } from "zod";

export const stockTransferDraftSchema = z
  .object({
    sourceLocationId: z.uuid(),
    destinationLocationId: z.uuid(),
    materialId: z.uuid(),
    unitId: z.uuid(),
    quantity: z.coerce.number().positive().max(999_999_999),
    purpose: z.enum(["ROUTINE", "PROJECT_CLOSE"]),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    ({ sourceLocationId, destinationLocationId }) =>
      sourceLocationId !== destinationLocationId,
    {
      path: ["destinationLocationId"],
      message: "Destination must be different from the source.",
    },
  );

export const stockTransferIdSchema = z.object({
  stockTransferId: z.uuid(),
});

export const stockTransferCancelSchema = stockTransferIdSchema.extend({
  reason: z.string().trim().min(3).max(1000),
});

export type StockTransferDraftInput = z.infer<typeof stockTransferDraftSchema>;
export type StockTransferCancelInput = z.infer<
  typeof stockTransferCancelSchema
>;
