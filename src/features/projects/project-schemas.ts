import { z } from "zod";

const code = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers, and hyphens.")
  .transform((value) => value.toUpperCase());

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date.")
  .optional();

export const projectSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    projectCode: code,
    name: z.string().trim().min(2).max(180),
    clientId: z.string().uuid(),
    location: z.string().trim().min(2).max(240),
    description: z.string().trim().max(2_000).optional(),
    startDate: optionalDate,
    expectedCompletionDate: optionalDate,
  })
  .superRefine((value, context) => {
    if (
      value.startDate &&
      value.expectedCompletionDate &&
      value.expectedCompletionDate < value.startDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedCompletionDate"],
        message: "Expected completion cannot be before the start date.",
      });
    }
  });

export const siteSchema = z.object({
  siteId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  siteCode: code,
  name: z.string().trim().min(2).max(180),
  location: z.string().trim().min(2).max(240),
  address: z.string().trim().max(1_000).optional(),
  description: z.string().trim().max(2_000).optional(),
});

export const projectAssignmentSchema = z.object({
  projectId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: z.enum(["PROJECT_MANAGER", "PROJECT_MEMBER"]),
  isPrimary: z.boolean().default(false),
});

export const siteAssignmentSchema = z.object({
  siteId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: z.enum(["SITE_SUPERVISOR", "SITE_MEMBER"]),
  isPrimary: z.boolean().default(false),
});

export const projectStatusSchema = z.object({
  projectId: z.string().uuid(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
});

export const siteStatusSchema = z.object({
  siteId: z.string().uuid(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
});

export function dateInput(value: string | undefined): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

export type ProjectInput = z.infer<typeof projectSchema>;
export type SiteInput = z.infer<typeof siteSchema>;
export type ProjectAssignmentInput = z.infer<typeof projectAssignmentSchema>;
export type SiteAssignmentInput = z.infer<typeof siteAssignmentSchema>;
export type ProjectStatusInput = z.infer<typeof projectStatusSchema>;
export type SiteStatusInput = z.infer<typeof siteStatusSchema>;
