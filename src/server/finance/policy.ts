import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/server/errors/app-error";
import type { AuthenticatedPrincipal } from "@/types/application";

export const accountRoles = ["ACCOUNTS", "ACCOUNTS_ADMIN"] as const;
export type AccountRole = (typeof accountRoles)[number];

export async function requireFinanceRole(
  tx: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  allowed: readonly string[],
) {
  if (principal.roleCodes.includes("SYSTEM_ADMINISTRATOR"))
    throw new AppError(
      "FORBIDDEN",
      "System Administrators have support visibility but cannot perform financial business actions.",
    );
  const role = principal.roleCodes.find((code) => allowed.includes(code));
  if (!role) throw new AppError("FORBIDDEN");
  const active = await tx.userRole.findFirst({
    where: {
      userId: principal.userId,
      role: { code: role, isActive: true },
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });
  if (!active) throw new AppError("FORBIDDEN");
  return role;
}

export const financialApprovalReasons = new Set([
  "CANCEL",
  "DISPUTE",
  "ACCEPT_MISMATCH",
  "REJECT",
  "PAYMENT_HOLD",
  "REVERSE",
]);

export function requireReason(reason: string | undefined, action: string) {
  const value = reason?.trim();
  if (!value || value.length < 3)
    throw new AppError(
      "VALIDATION_ERROR",
      `${action.replaceAll("_", " ")} requires a reason.`,
    );
  return value;
}
