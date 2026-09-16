import type { Prisma } from "@/generated/prisma/client";
import { indianFinancialYear } from "./domain";

const prefixes = {
  INVOICE: "INV",
  PAYMENT: "PAY",
  ADVANCE: "ADV",
  CREDIT_NOTE: "CRN",
  DEBIT_NOTE: "DBN",
  TALLY_EXPORT: "TALLY",
} as const;

export type FinanceDocumentType = keyof typeof prefixes;

export async function nextFinanceNumber(
  tx: Prisma.TransactionClient,
  type: FinanceDocumentType,
  date = new Date(),
) {
  const financialYear = indianFinancialYear(date).code;
  const lockKey = `finance-number:${type}:${financialYear}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text`;
  const sequence = await tx.financeSequence.upsert({
    where: {
      documentType_financialYear: { documentType: type, financialYear },
    },
    create: { documentType: type, financialYear, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
    select: { nextValue: true },
  });
  const value = sequence.nextValue - 1;
  return `${prefixes[type]}-${financialYear}-${String(value).padStart(4, "0")}`;
}
