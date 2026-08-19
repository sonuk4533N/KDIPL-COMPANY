import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/db/prisma";

export const DatabaseTransactionRunner = {
  run<T>(
    command: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return db.$transaction(command, { maxWait: 5_000, timeout: 15_000 });
  },
};
