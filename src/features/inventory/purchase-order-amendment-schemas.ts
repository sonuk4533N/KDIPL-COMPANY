import { z } from "zod";

const uuid = z.string().uuid();
const money = z.coerce.number().finite().min(0);
const quantity = z.coerce.number().finite().positive();

export const createPurchaseOrderAmendmentSchema = z.object({
  purchaseOrderId: uuid,
  reason: z.string().trim().min(3).max(1000),
  expectedDeliveryDate: z.string().min(1),
  paymentTerms: z.string().trim().min(1).max(500),
  freightAmount: money,
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: uuid,
        quantity,
        unitPrice: money,
      }),
    )
    .min(1),
});

export const decidePurchaseOrderAmendmentSchema = z.object({
  amendmentId: uuid,
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(3).max(1000).optional(),
}).superRefine((value, context) => {
  if (value.decision === "REJECT" && !value.reason) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: "A rejection reason is required.",
    });
  }
});

export type CreatePurchaseOrderAmendmentInput = z.infer<
  typeof createPurchaseOrderAmendmentSchema
>;
export type DecidePurchaseOrderAmendmentInput = z.infer<
  typeof decidePurchaseOrderAmendmentSchema
>;
