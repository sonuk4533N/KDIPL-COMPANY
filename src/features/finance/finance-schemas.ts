import { z } from "zod";

const uuid = z.uuid();
const date = z.iso.date();
const decimal = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,4})?$/, "Use a non-negative decimal value.");
const positive = decimal.refine(
  (value) => Number(value) > 0,
  "Must be positive.",
);
const optionalUuid = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  uuid.optional(),
);
const optionalDecimal = z.preprocess(
  (value) => (value === "" || value === null ? "0" : value),
  decimal,
);

export const invoiceLineSchema = z.object({
  purchaseOrderLineId: uuid,
  hsnSac: z.string().trim().min(2).max(20),
  quantity: positive,
  unitPrice: decimal,
  discountBeforeTax: optionalDecimal,
  discountAfterTax: optionalDecimal,
  freightAmount: optionalDecimal,
  freightTaxable: z.boolean().default(false),
  taxRuleVersionId: uuid,
  tdsRuleVersionId: optionalUuid,
  cessRuleVersionId: optionalUuid,
  reverseCharge: z.boolean().default(false),
  inputTaxCreditEligible: z.boolean().default(true),
  allocations: z
    .array(z.object({ goodsReceiptLineId: uuid, quantity: positive }))
    .min(1),
});

export const invoiceDraftSchema = z
  .object({
    supplierId: uuid,
    supplierInvoiceNumber: z.string().trim().min(1).max(100),
    invoiceDate: date,
    placeOfSupply: z.string().trim().min(2).max(120),
    purchaseOrderIds: z.array(uuid).min(1),
    goodsReceiptIds: z.array(uuid).min(1),
    creditDays: z.number().int().min(0).max(3650),
    creditTermsSource: z.enum(["SUPPLIER", "PURCHASE_ORDER"]),
    dueDate: date.optional(),
    dueDateOverrideReason: z.string().trim().max(1000).optional(),
    roundOff: z
      .string()
      .regex(/^-?\d(\.\d{1,2})?$/)
      .default("0"),
    remarks: z.string().trim().max(4000).optional(),
    documentId: uuid.optional(),
    lines: z.array(invoiceLineSchema).min(1).max(100),
  })
  .superRefine((value, context) => {
    if (value.dueDate && !value.dueDateOverrideReason?.trim())
      context.addIssue({
        code: "custom",
        path: ["dueDateOverrideReason"],
        message: "A due-date override requires a reason.",
      });
  });

export const invoiceCommandSchema = z.object({
  invoiceId: uuid,
  command: z.enum([
    "SUBMIT",
    "RUN_MATCH",
    "ACCEPT_MISMATCH",
    "RESUBMIT",
    "VERIFY",
    "REQUEST_APPROVAL",
    "APPROVE",
    "REJECT",
    "CANCEL",
    "PAYMENT_HOLD",
    "RELEASE_HOLD",
  ]),
  mismatchId: optionalUuid,
  reason: z.string().trim().max(1000).optional(),
});

export const paymentSchema = z.object({
  invoiceId: uuid,
  method: z.enum([
    "NEFT",
    "RTGS",
    "IMPS",
    "UPI",
    "CHEQUE",
    "CASH",
    "COMPANY_CARD",
    "EMPLOYEE_REIMBURSEMENT",
  ]),
  amount: positive,
  paymentDate: date,
  bankAccountId: optionalUuid,
  referenceNumber: z.string().trim().max(120).optional(),
  chequeNumber: z.string().trim().max(60).optional(),
  chequeDate: date.optional(),
  clearanceStatus: z.string().trim().max(30).optional(),
  proofDocumentId: uuid,
  reason: z.string().trim().min(3).max(1000),
});

export const taxRuleSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_-]{2,80}$/),
    kind: z.enum(["GST", "TDS", "CESS", "OTHER"]),
    rate: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/),
    effectiveFrom: date,
    effectiveTo: date.optional(),
    approvalReference: z.string().trim().min(3).max(500),
  })
  .refine((value) => Number(value.rate) <= 100, {
    path: ["rate"],
    message: "Rate cannot exceed 100 percent.",
  });

export const advanceSchema = z.object({
  purchaseOrderId: uuid,
  advancePercent: positive,
  amount: positive,
  method: paymentSchema.shape.method,
  referenceNumber: z.string().trim().min(1).max(120),
  evidenceDocumentId: uuid,
  reason: z.string().trim().min(3).max(1000),
});

export const financialNoteSchema = z.object({
  invoiceId: uuid,
  goodsReceiptId: optionalUuid,
  noteType: z.enum(["CREDIT", "DEBIT"]),
  reasonCode: z.enum([
    "RETURN_TO_VENDOR",
    "DAMAGED_REJECTED",
    "PRICE_CORRECTION",
    "QUANTITY_CORRECTION",
    "GST_CORRECTION",
    "DISCOUNT",
    "FREIGHT_CORRECTION",
  ]),
  reason: z.string().trim().min(3).max(1000),
  documentId: uuid,
  lines: z
    .array(
      z.object({
        invoiceLineId: uuid,
        hsnSac: z.string().trim().min(2).max(20),
        quantity: positive,
        taxableValue: decimal,
        taxRuleVersionId: uuid,
      }),
    )
    .min(1)
    .max(100),
});

export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;
export type InvoiceCommandInput = z.infer<typeof invoiceCommandSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type AdvanceInput = z.infer<typeof advanceSchema>;
export type FinancialNoteInput = z.infer<typeof financialNoteSchema>;
