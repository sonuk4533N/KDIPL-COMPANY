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

export function rfqDateInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export type RfqDraftInput = z.infer<typeof rfqDraftSchema>;
