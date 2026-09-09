import { z } from "zod";

const uuid = z.string().uuid();

export const materialIssueDraftSchema = z.object({
  sourceLocationId: uuid,
  materialId: uuid,
  unitId: uuid,
  siteId: uuid,
  quantity: z.coerce.number().finite().positive().max(999_999_999_999),
  purpose: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(2000).optional(),
});

export const materialIssueIdSchema = z.object({ materialIssueId: uuid });

export const materialIssueCancelSchema = materialIssueIdSchema.extend({
  reason: z.string().trim().min(3).max(1000),
});

export type MaterialIssueDraftInput = z.infer<typeof materialIssueDraftSchema>;
export type MaterialIssueCancelInput = z.infer<
  typeof materialIssueCancelSchema
>;
