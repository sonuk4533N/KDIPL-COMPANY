import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/server/errors/app-error";

const prefixPattern = /^[A-Z]{2,4}$/;

export function formatTransactionNumber(
  prefix: string,
  year: number,
  value: bigint | number,
): string {
  const normalized = prefix.toUpperCase();
  if (
    !prefixPattern.test(normalized) ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 9999
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid transaction-number prefix or year.",
    );
  }
  return `${normalized}-${year}-${value.toString().padStart(4, "0")}`;
}

export const TransactionNumberService = {
  async next(
    prefix: string,
    date: Date,
    transaction: Prisma.TransactionClient,
  ): Promise<string> {
    const normalized = prefix.toUpperCase();
    const year = date.getUTCFullYear();
    if (!prefixPattern.test(normalized)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid transaction-number prefix.",
      );
    }

    const rows = await transaction.$queryRaw<Array<{ currentValue: bigint }>>`
      INSERT INTO "BusinessSequence" ("prefix", "year", "currentValue", "updatedAt")
      VALUES (${normalized}, ${year}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("prefix", "year")
      DO UPDATE SET "currentValue" = "BusinessSequence"."currentValue" + 1,
                    "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "currentValue"
    `;
    const value = rows[0]?.currentValue;
    if (value === undefined) throw new AppError("INTERNAL_ERROR");
    return formatTransactionNumber(normalized, year, value);
  },
};
