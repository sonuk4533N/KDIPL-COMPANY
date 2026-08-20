import "server-only";

import { db } from "@/db/prisma";
import { AuditAction } from "@/generated/prisma/enums";
import { AuditService } from "@/server/audit/audit-service";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { AppError } from "@/server/errors/app-error";
import type { AppSession } from "@/types/application";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/features/auth/password-policy";

export async function changeOwnPassword(
  session: AppSession,
  input: ChangePasswordInput,
) {
  const data = changePasswordSchema.parse(input);
  const user = await db.user.findUnique({
    where: { id: session.principal.userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      authVersion: true,
      mustChangePassword: true,
    },
  });
  if (!user) throw new AppError("NOT_FOUND");
  if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
    throw new AppError("UNAUTHORIZED", "Current password is incorrect.");
  }
  if (await verifyPassword(user.passwordHash, data.newPassword)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose a password you have not just been using.",
    );
  }
  const passwordHash = await hashPassword(data.newPassword);
  await db.$transaction(async (transaction) => {
    const updated = await transaction.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        authVersion: { increment: 1 },
      },
      select: { authVersion: true },
    });
    await transaction.session.updateMany({
      where: { userId: user.id, id: { not: session.id }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transaction.session.updateMany({
      where: { id: session.id, userId: user.id, revokedAt: null },
      data: { authVersion: updated.authVersion },
    });
    await AuditService.record(
      {
        actorUserId: user.id,
        action: AuditAction.UPDATE,
        entityType: "UserCredential",
        entityId: user.id,
        before: { mustChangePassword: user.mustChangePassword },
        after: { passwordChanged: true, otherSessionsRevoked: true },
      },
      transaction,
    );
  });
}

export async function revokeOwnSession(
  currentSession: AppSession,
  sessionId: string,
) {
  if (currentSession.id === sessionId) {
    throw new AppError(
      "CONFLICT",
      "Use Sign out to end the session on this device.",
    );
  }
  await db.$transaction(async (transaction) => {
    const result = await transaction.session.updateMany({
      where: {
        id: sessionId,
        userId: currentSession.principal.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new AppError("NOT_FOUND");
    await AuditService.record(
      {
        actorUserId: currentSession.principal.userId,
        action: AuditAction.LOGOUT,
        entityType: "Session",
        entityId: sessionId,
        reason: "Revoked by account owner",
      },
      transaction,
    );
  });
}

export async function revokeOtherSessions(currentSession: AppSession) {
  await db.$transaction(async (transaction) => {
    const result = await transaction.session.updateMany({
      where: {
        userId: currentSession.principal.userId,
        id: { not: currentSession.id },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    await AuditService.record(
      {
        actorUserId: currentSession.principal.userId,
        action: AuditAction.LOGOUT,
        entityType: "Session",
        entityId: currentSession.id,
        reason: "Revoked other sessions",
        after: { revokedCount: result.count },
      },
      transaction,
    );
    return result.count;
  });
}

export const CredentialService = {
  changeOwnPassword,
  revokeOwnSession,
  revokeOtherSessions,
};
