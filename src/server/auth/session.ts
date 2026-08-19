import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";
import { env } from "@/config/env";
import { db } from "@/db/prisma";
import type { AppSession, PermissionCode } from "@/types/application";

export const SESSION_COOKIE_NAME =
  env.NODE_ENV === "production" ? "__Host-kdipl-session" : "kdipl_session";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function calculateSessionExpiry(now = new Date()) {
  return {
    absoluteExpiresAt: new Date(
      now.getTime() + env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
    ),
    idleExpiresAt: new Date(
      now.getTime() + env.SESSION_IDLE_MINUTES * 60 * 1000,
    ),
  };
}

export async function createSession(
  userId: string,
  authVersion: number,
  metadata: { userAgent?: string | null; ipHash?: string | null },
  client: Prisma.TransactionClient,
) {
  const token = randomBytes(32).toString("base64url");
  const expiry = calculateSessionExpiry();
  const session = await client.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      authVersion,
      ...expiry,
      userAgent: metadata.userAgent?.slice(0, 500),
      ipHash: metadata.ipHash,
    },
  });
  return { token, session };
}

export async function revokeSessionToken(token: string): Promise<void> {
  await db.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function validateSessionToken(
  token: string,
  now = new Date(),
): Promise<AppSession | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.absoluteExpiresAt <= now ||
    session.idleExpiresAt <= now ||
    session.user.status !== UserStatus.ACTIVE ||
    session.authVersion !== session.user.authVersion
  ) {
    if (session && !session.revokedAt) {
      await db.session
        .update({ where: { id: session.id }, data: { revokedAt: now } })
        .catch(() => undefined);
    }
    return null;
  }

  const refreshThreshold = 5 * 60 * 1000;
  if (now.getTime() - session.lastSeenAt.getTime() >= refreshThreshold) {
    const proposedIdle = new Date(
      now.getTime() + env.SESSION_IDLE_MINUTES * 60 * 1000,
    );
    await db.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        idleExpiresAt:
          proposedIdle < session.absoluteExpiresAt
            ? proposedIdle
            : session.absoluteExpiresAt,
      },
    });
  }

  const roleCodes = session.user.roles
    .filter(({ role }) => role.isActive)
    .map(({ role }) => role.code);
  const permissions = Array.from(
    new Set(
      session.user.roles.flatMap(({ role }) =>
        role.isActive
          ? role.permissions.map(
              ({ permission }) => permission.code as PermissionCode,
            )
          : [],
      ),
    ),
  );

  return {
    id: session.id,
    absoluteExpiresAt: session.absoluteExpiresAt,
    idleExpiresAt: session.idleExpiresAt,
    principal: {
      userId: session.user.id,
      displayName: session.user.displayName,
      email: session.user.email,
      employeeId: session.user.employeeId,
      roleCodes,
      permissions,
    },
  };
}
