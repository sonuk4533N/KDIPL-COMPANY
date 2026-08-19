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
  revokeSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { DatabaseTransactionRunner } from "@/server/database/transaction-runner";
import { AppError, toCommandError } from "@/server/errors/app-error";
import { logger } from "@/server/logging/logger";
import type { CommandResult } from "@/types/application";
import { loginSchema } from "@/features/auth/login-schema";

export type LoginState = CommandResult<{ redirectTo: string }> | null;

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
    return { ok: true, data: { redirectTo: "/dashboard" } };
  } catch (error) {
    logger.error({
      err: error instanceof AppError ? { code: error.code } : error,
      event: "auth.login_error",
    });
    return toCommandError(error);
  }
}

export async function logoutAction(): Promise<never> {
  await validateMutationOrigin();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) await revokeSessionToken(token);
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
