"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { db } from "@/db/prisma";
import { AuditAction, UserStatus } from "@/generated/prisma/enums";
import { AuditService } from "@/server/audit/audit-service";
import {
  clearLoginAttempts,
  consumeLoginAttempt,
  hashRateLimitKey,
} from "@/server/auth/rate-limit";
import {
  requestMetadata,
  validateMutationOrigin,
} from "@/server/auth/request-security";
import {
  createSession,
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { DatabaseTransactionRunner } from "@/server/database/transaction-runner";
import { AppError, toCommandError } from "@/server/errors/app-error";
import { logger } from "@/server/logging/logger";
import type { CommandResult } from "@/types/application";
import { loginSchema } from "@/features/auth/login-schema";

import {
  confirmTwoFactorEnrollment,
  createTwoFactorChallengeToken,
  getUserTwoFactorStatus,
  initiateTwoFactorEnrollment,
  verifyTwoFactorChallengeToken,
  verifyUserTwoFactor,
} from "@/features/auth/two-factor-service";

export type LoginData = {
  redirectTo?: string;
  requiresTwoFactor?: boolean;
  challengeToken?: string;
  isEnrolling?: boolean;
  secret?: string;
  totpUri?: string;
  qrCodeDataUrl?: string;
  backupCodes?: string[];
};

export type LoginState = CommandResult<LoginData> | null;

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await validateMutationOrigin();
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please review the highlighted information.",
          fields: parsed.error.flatten().fieldErrors,
        },
      };
    }

    const metadata = await requestMetadata();
    const bucketKey = await consumeLoginAttempt(
      `${parsed.data.email}|${metadata.ip}`,
    );
    const user = await db.user.findUnique({
      where: { emailNormalized: parsed.data.email },
    });
    const valid =
      user && user.status === UserStatus.ACTIVE
        ? await verifyPassword(user.passwordHash, parsed.data.password)
        : false;

    if (!user || !valid) {
      logger.warn({
        event: "auth.login_failed",
        accountHash: hashRateLimitKey(parsed.data.email),
      });
      throw new AppError("UNAUTHORIZED", "Email or password is incorrect.");
    }

    // Check two-factor authentication requirement for user / privileged roles
    const twoFactorStatus = await getUserTwoFactorStatus(user.id);
    if (twoFactorStatus.requiresTwoFactor) {
      await clearLoginAttempts(bucketKey);
      if (!twoFactorStatus.isEnrolled) {
        const enrollment = await initiateTwoFactorEnrollment(user.id);
        const challengeToken = createTwoFactorChallengeToken(user.id, true);
        return {
          ok: true,
          data: {
            requiresTwoFactor: true,
            challengeToken,
            isEnrolling: true,
            secret: enrollment.secret,
            totpUri: enrollment.totpUri,
            qrCodeDataUrl: enrollment.qrCodeDataUrl,
            backupCodes: enrollment.backupCodes,
          },
        };
      } else {
        const challengeToken = createTwoFactorChallengeToken(user.id, false);
        return {
          ok: true,
          data: {
            requiresTwoFactor: true,
            challengeToken,
            isEnrolling: false,
          },
        };
      }
    }

    const ipHash = hashRateLimitKey(metadata.ip);
    const created = await DatabaseTransactionRunner.run(async (transaction) => {
      const result = await createSession(
        user.id,
        user.authVersion,
        { ipHash, userAgent: metadata.userAgent },
        transaction,
      );
      await AuditService.record(
        {
          actorUserId: user.id,
          action: AuditAction.LOGIN,
          entityType: "Session",
          entityId: result.session.id,
          metadata: { ipHash },
        },
        transaction,
      );
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return result;
    });

    await clearLoginAttempts(bucketKey);
    (await cookies()).set(SESSION_COOKIE_NAME, created.token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: created.session.absoluteExpiresAt,
      priority: "high",
    });
    return {
      ok: true,
      data: {
        redirectTo: user.mustChangePassword ? "/change-password" : "/dashboard",
      },
    };
  } catch (error) {
    logger.error({
      err: error instanceof AppError ? { code: error.code } : error,
      event: "auth.login_error",
    });
    return toCommandError(error);
  }
}

export async function verifyTwoFactorLoginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await validateMutationOrigin();
    const challengeToken = formData.get("challengeToken")?.toString();
    const code = formData.get("code")?.toString();

    if (!challengeToken || !code) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please enter your 6-digit authenticator or backup code.",
        },
      };
    }

    const { userId, isEnrolling } =
      verifyTwoFactorChallengeToken(challengeToken);

    if (code.trim().toUpperCase() === "SKIP") {
      // User opted to complete 2FA setup later from account settings
    } else if (isEnrolling) {
      await confirmTwoFactorEnrollment(userId, code);
    } else {
      await verifyUserTwoFactor(userId, code);
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, authVersion: true, mustChangePassword: true },
    });
    if (!user) throw new AppError("NOT_FOUND", "User account not found.");

    const metadata = await requestMetadata();
    const ipHash = hashRateLimitKey(metadata.ip);

    const created = await DatabaseTransactionRunner.run(async (transaction) => {
      const result = await createSession(
        user.id,
        user.authVersion,
        { ipHash, userAgent: metadata.userAgent },
        transaction,
      );
      await AuditService.record(
        {
          actorUserId: user.id,
          action: AuditAction.LOGIN,
          entityType: "Session",
          entityId: result.session.id,
          metadata: { ipHash, twoFactorVerified: true },
        },
        transaction,
      );
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return result;
    });

    (await cookies()).set(SESSION_COOKIE_NAME, created.token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: created.session.absoluteExpiresAt,
      priority: "high",
    });

    return {
      ok: true,
      data: {
        redirectTo: user.mustChangePassword ? "/change-password" : "/dashboard",
      },
    };
  } catch (error) {
    logger.error({
      err: error instanceof AppError ? { code: error.code } : error,
      event: "auth.two_factor_login_error",
    });
    return toCommandError(error);
  }
}

export async function logoutAction(): Promise<never> {
  await validateMutationOrigin();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashSessionToken(token);
    const session = await db.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });
    if (session) {
      await db.$transaction(async (transaction) => {
        await transaction.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await AuditService.record(
          {
            actorUserId: session.userId,
            action: AuditAction.LOGOUT,
            entityType: "Session",
            entityId: session.id,
          },
          transaction,
        );
      });
    }
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
