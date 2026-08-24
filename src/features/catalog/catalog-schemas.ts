import { z } from "zod";

const code = (maximum = 50) =>
  z
    .string()
    .trim()
    .min(2)
    .max(maximum)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Use only letters, numbers, hyphens, and underscores.",
    )
    .transform((value) => value.toUpperCase());

const optionalEmail = z.string().trim().email().max(320).optional();

export const clientSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientCode: code(),
  name: z.string().trim().min(2).max(180),
  address: z.string().trim().max(1_000).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a 6-digit postal code.")
    .optional(),
  phone: z.string().trim().max(30).optional(),
  email: optionalEmail,
});

export const categorySchema = z.object({
  categoryId: z.string().uuid().optional(),
  code: code(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1_000).optional(),
});

export const unitSchema = z.object({
  unitId: z.string().uuid().optional(),
  code: code(30),
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(20),
  description: z.string().trim().max(500).optional(),
  decimalScale: z.coerce.number().int().min(0).max(6),
});

export const materialSchema = z
  .object({
    materialId: z.string().uuid().optional(),
    materialCode: code(),
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().max(2_000).optional(),
    categoryId: z.string().uuid(),
    defaultUnitId: z.string().uuid(),
    minimumStockLevel: z.coerce.number().finite().min(0).max(999_999_999),
    reorderLevel: z.coerce.number().finite().min(0).max(999_999_999),
  })
  .superRefine((value, context) => {
    if (value.reorderLevel < value.minimumStockLevel) {
      context.addIssue({
        code: "custom",
        path: ["reorderLevel"],
        message: "Reorder level cannot be below minimum stock.",
      });
    }
  });

export const supplierSchema = z
  .object({
    supplierId: z.string().uuid().optional(),
    supplierCode: code(),
    legalName: z.string().trim().min(2).max(180),
    tradeName: z.string().trim().max(180).optional(),
    gstin: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(
        z
          .string()
          .regex(
            /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
            "Enter a valid 15-character GSTIN.",
          ),
      )
      .optional(),
    address: z.string().trim().max(1_000).optional(),
    city: z.string().trim().min(2).max(120),
    state: z.string().trim().min(2).max(120),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter a 6-digit postal code.")
      .optional(),
    phone: z.string().trim().max(30).optional(),
    email: optionalEmail,
    isGstRegistered: z.boolean().default(false),
    contactName: z.string().trim().max(160).optional(),
    contactDesignation: z.string().trim().max(120).optional(),
    contactPhone: z.string().trim().max(30).optional(),
    contactEmail: optionalEmail,
  })
  .superRefine((value, context) => {
    if (value.isGstRegistered && !value.gstin) {
      context.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "GSTIN is required for a GST-registered supplier.",
      });
    }
    if (value.contactName && !value.contactPhone && !value.contactEmail) {
      context.addIssue({
        code: "custom",
        path: ["contactPhone"],
        message: "Add a phone number or email for the primary contact.",
      });
    }
    if (!value.contactName && (value.contactPhone || value.contactEmail)) {
      context.addIssue({
        code: "custom",
        path: ["contactName"],
        message: "Add the contact name.",
      });
    }
  });

export type ClientInput = z.infer<typeof clientSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type MaterialInput = z.infer<typeof materialSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
