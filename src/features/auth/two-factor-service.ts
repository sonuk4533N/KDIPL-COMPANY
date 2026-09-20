import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";
import { db } from "@/db/prisma";
import { AuditAction } from "@/generated/prisma/enums";
import { AuditService } from "@/server/audit/audit-service";
import {
  generateBackupCodes,
  generateTotpSecret,
  generateTotpUri,
  verifyAndConsumeBackupCode,
  verifyTotpCode,
} from "@/server/auth/totp";
import { AppError } from "@/server/errors/app-error";

/**
 * Roles that mandate two-factor authentication per KDIPL security policy.
 */
export const PRIVILEGED_ROLE_CODES = [
  "SYSTEM_ADMINISTRATOR",
  "ACCOUNTS",
  "ACCOUNTS_ADMIN",
  "MANAGING_DIRECTOR",
  "PROJECT_DIRECTOR",
  "BUSINESS_DEVELOPMENT_DIRECTOR",
] as const;

export type PrivilegedRoleCode = (typeof PRIVILEGED_ROLE_CODES)[number];

export function isPrivilegedRole(roleCodes: string[]): boolean {
  return roleCodes.some((code) =>
    (PRIVILEGED_ROLE_CODES as readonly string[]).includes(code),
  );
}

export type ChallengePayload = {
  userId: string;
  isEnrolling: boolean;
  exp: number;
};

/**
 * Creates a signed, time-limited challenge token used during the 2FA login phase.
 */
export function createTwoFactorChallengeToken(
  userId: string,
  isEnrolling: boolean,
): string {
  const payload: ChallengePayload = {
    userId,
    isEnrolling,
    exp: Date.now() + 5 * 60 * 1000, // 5 minutes validity
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", env.AUTH_SECRET)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Validates the HMAC signature and expiration of a 2FA challenge token.
 */
export function verifyTwoFactorChallengeToken(token: string): ChallengePayload {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AppError("UNAUTHORIZED", "Invalid 2FA challenge token.");
  }

  const [payloadB64, signature] = parts;
  const expectedSig = createHmac("sha256", env.AUTH_SECRET)
    .update(payloadB64)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new AppError("UNAUTHORIZED", "2FA challenge verification failed.");
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8"),
    ) as ChallengePayload;

    if (Date.now() > payload.exp) {
      throw new AppError(
        "UNAUTHORIZED",
        "2FA challenge expired. Please sign in again.",
      );
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("UNAUTHORIZED", "Malformed 2FA challenge payload.");
  }
}

/**
 * Generates an enrollment secret and URI for setting up 2FA.
 */
export async function initiateTwoFactorEnrollment(userId: string): Promise<{
  secret: string;
  totpUri: string;
  backupCodes: string[];
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AppError("NOT_FOUND", "Active user account not found.");
  }

  const secret = generateTotpSecret();
  const { rawCodes, hashedCodes } = generateBackupCodes(8);
  const totpUri = generateTotpUri({
    issuer: "KDIPL ERP",
    accountName: user.email,
    secret,
  });

  // Temporarily store the candidate secret & backup codes pending confirmation
  await db.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: secret,
      twoFactorBackupCodes: hashedCodes,
    },
  });

  return {
    secret,
    totpUri,
    backupCodes: rawCodes,
  };
}

/**
 * Verifies the first code and formally enables 2FA on the user account.
 */
export async function confirmTwoFactorEnrollment(
  userId: string,
  code: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      twoFactorSecret: true,
      twoFactorEnabled: true,
      roles: { include: { role: true } },
    },
  });

  if (!user || !user.twoFactorSecret) {
    throw new AppError("VALIDATION_ERROR", "No pending 2FA setup found.");
  }

  const isValid = verifyTotpCode(user.twoFactorSecret, code);
  if (!isValid) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid 6-digit code. Check your authenticator app and try again.",
    );
  }

  await db.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorEnrolledAt: new Date(),
      },
    });

    await AuditService.record(
      {
        actorUserId: userId,
        action: AuditAction.UPDATE,
        entityType: "UserCredential",
        entityId: userId,
        after: { twoFactorEnabled: true },
        reason:
          "Two-factor authentication successfully configured and verified",
      },
      transaction,
    );
  });
}

/**
 * Verifies a submitted TOTP code or emergency backup code during sign-in.
 */
export async function verifyUserTwoFactor(
  userId: string,
  code: string,
): Promise<{ success: boolean; method: "totp" | "backup_code" }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      twoFactorSecret: true,
      twoFactorEnabled: true,
      twoFactorBackupCodes: true,
    },
  });

  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Two-factor authentication is not active for this account.",
    );
  }

  // 1. Try TOTP code first
  if (verifyTotpCode(user.twoFactorSecret, code)) {
    return { success: true, method: "totp" };
  }

  // 2. Try single-use backup recovery code
  const { valid, remainingHashedCodes } = verifyAndConsumeBackupCode(
    code,
    user.twoFactorBackupCodes,
  );

  if (valid) {
    await db.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: remainingHashedCodes },
    });

    await AuditService.record(
      {
        actorUserId: userId,
        action: AuditAction.LOGIN,
        entityType: "UserCredential",
        entityId: userId,
        reason: "Logged in using emergency two-factor backup recovery code",
      },
      db,
    );

    return { success: true, method: "backup_code" };
  }

  throw new AppError(
    "UNAUTHORIZED",
    "Invalid authenticator code or backup recovery code.",
  );
}

/**
 * Helper to determine if a user requires 2FA authentication on login.
 */
export async function getUserTwoFactorStatus(userId: string): Promise<{
  requiresTwoFactor: boolean;
  isEnrolled: boolean;
  isPrivileged: boolean;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      twoFactorEnabled: true,
      roles: {
        where: { role: { isActive: true } },
        include: { role: true },
      },
    },
  });

  if (!user) {
    return {
      requiresTwoFactor: false,
      isEnrolled: false,
      isPrivileged: false,
    };
  }

  const roleCodes = user.roles.map((r) => r.role.code);
  const privileged = isPrivilegedRole(roleCodes);
  const enrolled = user.twoFactorEnabled;

  return {
    requiresTwoFactor: privileged || enrolled,
    isEnrolled: enrolled,
    isPrivileged: privileged,
  };
}
