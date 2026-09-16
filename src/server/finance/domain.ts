import { Prisma } from "@/generated/prisma/client";

type DecimalValue = string | number | Prisma.Decimal;
const D = (value: DecimalValue) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2);

export type GstMode = "CGST_SGST" | "IGST";

export interface InvoiceLineCalculationInput {
  quantity: DecimalValue;
  unitPrice: DecimalValue;
  discountBeforeTax?: DecimalValue;
  discountAfterTax?: DecimalValue;
  gstRate: DecimalValue;
  freight?: DecimalValue;
  freightTaxable?: boolean;
  tdsRate?: DecimalValue;
  reverseCharge?: boolean;
  supplierState: string;
  placeOfSupply: string;
}

export interface InvoiceLineCalculation {
  grossValue: Prisma.Decimal;
  taxableValue: Prisma.Decimal;
  nonTaxableFreight: Prisma.Decimal;
  gstMode: GstMode;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
  igst: Prisma.Decimal;
  cess: Prisma.Decimal;
  tds: Prisma.Decimal;
  supplierPayable: Prisma.Decimal;
}

function nonNegative(value: DecimalValue | undefined, field: string) {
  const decimal = D(value ?? 0);
  if (!decimal.isFinite() || decimal.isNegative())
    throw new Error(`${field} must be non-negative.`);
  return decimal;
}

export function normalizeState(value: string) {
  return value.trim().replaceAll(/\s+/g, " ").toUpperCase();
}

export function calculateInvoiceLine(
  input: InvoiceLineCalculationInput & { cessRate?: DecimalValue },
): InvoiceLineCalculation {
  const quantity = nonNegative(input.quantity, "quantity");
  const unitPrice = nonNegative(input.unitPrice, "unitPrice");
  const discountBeforeTax = nonNegative(
    input.discountBeforeTax,
    "discountBeforeTax",
  );
  const discountAfterTax = nonNegative(
    input.discountAfterTax,
    "discountAfterTax",
  );
  const freight = nonNegative(input.freight, "freight");
  const gstRate = nonNegative(input.gstRate, "gstRate");
  const cessRate = nonNegative(input.cessRate, "cessRate");
  const tdsRate = nonNegative(input.tdsRate, "tdsRate");
  if (quantity.lte(0)) throw new Error("quantity must be positive.");
  if (gstRate.gt(100) || cessRate.gt(100) || tdsRate.gt(100))
    throw new Error("Tax rates cannot exceed 100 percent.");

  const grossValue = money(quantity.mul(unitPrice));
  const taxableFreight = input.freightTaxable ? freight : D(0);
  const nonTaxableFreight = input.freightTaxable ? D(0) : money(freight);
  const taxableValue = money(
    grossValue.minus(discountBeforeTax).plus(taxableFreight),
  );
  if (taxableValue.isNegative())
    throw new Error("Discount before tax cannot exceed the taxable value.");

  const gst = money(taxableValue.mul(gstRate).div(100));
  const cess = money(taxableValue.mul(cessRate).div(100));
  const gstMode: GstMode =
    normalizeState(input.supplierState) === normalizeState(input.placeOfSupply)
      ? "CGST_SGST"
      : "IGST";
  const cgst = gstMode === "CGST_SGST" ? money(gst.div(2)) : D(0);
  const sgst = gstMode === "CGST_SGST" ? gst.minus(cgst) : D(0);
  const igst = gstMode === "IGST" ? gst : D(0);
  const tds = money(taxableValue.mul(tdsRate).div(100));
  const supplierTax = input.reverseCharge ? D(0) : gst.plus(cess);
  const supplierPayable = money(
    taxableValue
      .plus(nonTaxableFreight)
      .plus(supplierTax)
      .minus(discountAfterTax)
      .minus(tds),
  );
  if (supplierPayable.isNegative())
    throw new Error("Deductions cannot exceed the supplier payable amount.");
  return {
    grossValue,
    taxableValue,
    nonTaxableFreight,
    gstMode,
    cgst,
    sgst,
    igst,
    cess,
    tds,
    supplierPayable,
  };
}

export function calculateInvoiceTotal(
  lines: readonly InvoiceLineCalculation[],
  roundOff: DecimalValue = 0,
) {
  if (lines.length === 0)
    throw new Error("At least one invoice line is required.");
  const sum = (selector: (line: InvoiceLineCalculation) => Prisma.Decimal) =>
    lines.reduce((total, line) => total.plus(selector(line)), D(0));
  const payableBeforeRoundOff = money(sum((line) => line.supplierPayable));
  const rounding = D(roundOff);
  if (rounding.abs().gt(1))
    throw new Error("Round-off must be between -1 and 1.");
  return {
    taxableValue: money(sum((line) => line.taxableValue)),
    cgst: money(sum((line) => line.cgst)),
    sgst: money(sum((line) => line.sgst)),
    igst: money(sum((line) => line.igst)),
    cess: money(sum((line) => line.cess)),
    tds: money(sum((line) => line.tds)),
    roundOff: money(rounding),
    total: money(payableBeforeRoundOff.plus(rounding)),
  };
}

export function indianFinancialYear(date: Date) {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? year : year - 1;
  return {
    start,
    end: start + 1,
    code: `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`,
  };
}

export function calculateDueDate(invoiceDate: Date, creditDays: number) {
  if (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 3650)
    throw new Error("Credit days must be a whole number between 0 and 3650.");
  const due = new Date(
    Date.UTC(
      invoiceDate.getUTCFullYear(),
      invoiceDate.getUTCMonth(),
      invoiceDate.getUTCDate(),
    ),
  );
  due.setUTCDate(due.getUTCDate() + creditDays);
  return due;
}

export function payableBalance(
  approvedTotal: DecimalValue,
  successfulPayments: readonly DecimalValue[],
  appliedCredits: readonly DecimalValue[] = [],
  appliedDebits: readonly DecimalValue[] = [],
  appliedAdvances: readonly DecimalValue[] = [],
) {
  const sum = (items: readonly DecimalValue[]) =>
    items.reduce<Prisma.Decimal>((total, item) => total.plus(D(item)), D(0));
  const balance = D(approvedTotal)
    .plus(sum(appliedDebits))
    .minus(sum(successfulPayments))
    .minus(sum(appliedCredits))
    .minus(sum(appliedAdvances));
  if (balance.isNegative())
    throw new Error("Financial applications exceed the approved payable.");
  return money(balance);
}

export const invoiceStates = [
  "DRAFT",
  "UNDER_REVIEW",
  "MATCHED",
  "VERIFIED",
  "MD_APPROVAL_PENDING",
  "APPROVED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
  "DISPUTED",
  "REJECTED",
  "PAYMENT_HOLD",
] as const;
export type InvoiceState = (typeof invoiceStates)[number];

const invoiceTransitions: Record<string, readonly InvoiceState[]> = {
  DRAFT: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["MATCHED", "DISPUTED"],
  DISPUTED: ["UNDER_REVIEW"],
  MATCHED: ["VERIFIED"],
  VERIFIED: ["MD_APPROVAL_PENDING"],
  MD_APPROVAL_PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["PARTIALLY_PAID", "PAID", "PAYMENT_HOLD"],
  PARTIALLY_PAID: ["PARTIALLY_PAID", "PAID", "PAYMENT_HOLD"],
  PAYMENT_HOLD: ["APPROVED", "PARTIALLY_PAID"],
};

export function assertInvoiceTransition(from: InvoiceState, to: InvoiceState) {
  if (!invoiceTransitions[from]?.includes(to))
    throw new Error(`Invoice transition ${from} -> ${to} is not allowed.`);
}

export function normalizeSupplierInvoiceNumber(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "");
  if (!normalized) throw new Error("Invoice number is required.");
  return normalized;
}
