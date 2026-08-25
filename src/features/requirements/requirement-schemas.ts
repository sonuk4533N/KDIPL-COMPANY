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

const quantity = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/,
    "Enter a positive quantity with up to 3 decimal places.",
  )
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

export const requirementLineSchema = z.object({
  materialId: z.string().uuid(),
  quantity,
  notes: z.string().trim().max(500).optional(),
});

export const requirementDraftSchema = z
  .object({
    requirementId: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    siteId: z.string().uuid(),
    neededBy: calendarDate,
    purpose: z.string().trim().min(5).max(500),
    notes: z.string().trim().max(2_000).optional(),
    lines: z.array(requirementLineSchema).min(1).max(50),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.materialId)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "materialId"],
          message: "Each material can appear only once.",
        });
      }
      seen.add(line.materialId);
    });
  });

export const requirementSubmitSchema = z.object({
  requirementId: z.string().uuid(),
});

export const requirementDecisionSchema = z
  .object({
    requirementId: z.string().uuid(),
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
        message: "Give a reason for rejecting or sending back a requirement.",
      });
    }
  });

export function requirementDateInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export type RequirementDraftInput = z.infer<typeof requirementDraftSchema>;
export type RequirementLineInput = z.infer<typeof requirementLineSchema>;
export type RequirementSubmitInput = z.infer<typeof requirementSubmitSchema>;
export type RequirementDecisionInput = z.infer<
  typeof requirementDecisionSchema
>;
