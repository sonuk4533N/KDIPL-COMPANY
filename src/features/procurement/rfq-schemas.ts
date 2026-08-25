import { z } from "zod";

const calendarDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date.");

export const rfqDraftSchema = z
  .object({
    rfqId: z.string().uuid().optional(),
    requirementId: z.string().uuid(),
    responseDueDate: calendarDate,
    supplierIds: z.array(z.string().uuid()).min(1).max(20),
    notes: z.string().trim().max(2_000).optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.supplierIds).size !== value.supplierIds.length) {
      context.addIssue({
        code: "custom",
        path: ["supplierIds"],
        message: "Each supplier can be invited only once.",
      });
    }
  });

const money = z
  .string()
  .trim()
  .regex(
    /^\d{1,13}(?:\.\d{1,2})?$/,
    "Use a non-negative amount with up to 2 decimals.",
  );

const percentage = z
  .string()
  .trim()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/, "Use a percentage with up to 2 decimals.")
  .refine((value) => Number(value) <= 100, "GST rate cannot exceed 100%.");

export const rfqIdSchema = z.object({ rfqId: z.string().uuid() });

export const rfqCancelSchema = z.object({
  rfqId: z.string().uuid(),
  reason: z.string().trim().min(5).max(1_000),
});

export const supplierQuotationSchema = z
  .object({
    rfqId: z.string().uuid(),
    supplierId: z.string().uuid(),
    quoteReference: z.string().trim().min(1).max(100),
    quoteDate: calendarDate,
    validUntil: calendarDate,
    offeredDeliveryDate: calendarDate,
    paymentTerms: z.string().trim().min(3).max(500),
    gstRate: percentage,
    freightAmount: money,
    notes: z.string().trim().max(2_000).optional(),
    linePrices: z
      .array(
        z.object({
          requirementLineId: z.string().uuid(),
          unitPrice: money,
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((value, context) => {
    if (value.validUntil < value.quoteDate) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Validity cannot end before the quote date.",
      });
    }
    if (value.offeredDeliveryDate < value.quoteDate) {
      context.addIssue({
        code: "custom",
        path: ["offeredDeliveryDate"],
        message: "Delivery cannot be before the quote date.",
      });
    }
    const lineIds = value.linePrices.map(
      ({ requirementLineId }) => requirementLineId,
    );
    if (new Set(lineIds).size !== lineIds.length) {
      context.addIssue({
        code: "custom",
        path: ["linePrices"],
        message: "Each material line can be priced only once.",
      });
    }
  });

export const rfqRecommendationSchema = z.object({
  rfqId: z.string().uuid(),
  quotationId: z.string().uuid(),
  reason: z.string().trim().min(5).max(1_000),
});

export const rfqDecisionSchema = z
  .object({
    rfqId: z.string().uuid(),
    decision: z.enum(["APPROVE", "REJECT", "SEND_BACK"]),
    reason: z.string().trim().max(1_000).optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.decision === "REJECT" || value.decision === "SEND_BACK") &&
      !value.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Give a reason for rejection or send-back.",
      });
    }
  });

export function rfqDateInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export type RfqDraftInput = z.infer<typeof rfqDraftSchema>;
export type SupplierQuotationInput = z.infer<typeof supplierQuotationSchema>;
export type RfqRecommendationInput = z.infer<typeof rfqRecommendationSchema>;
export type RfqDecisionInput = z.infer<typeof rfqDecisionSchema>;
export type RfqCancelInput = z.infer<typeof rfqCancelSchema>;
