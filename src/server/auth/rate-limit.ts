import "server-only";

import { createHmac } from "node:crypto";

import { env } from "@/config/env";
import { db } from "@/db/prisma";
import { AppError } from "@/server/errors/app-error";

export function hashRateLimitKey(value: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(value).digest("hex");
}

export async function consumeLoginAttempt(
  identifier: string,
  now = new Date(),
): Promise<string> {
  const keyHash = hashRateLimitKey(identifier);
  const windowMs = env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  const expiresAt = new Date(now.getTime() + windowMs);

  const rows = await db.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
    INSERT INTO "RateLimitBucket" ("keyHash", "windowStart", "count", "expiresAt", "updatedAt")
    VALUES (${keyHash}, ${now}, 1, ${expiresAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("keyHash") DO UPDATE SET
      "windowStart" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now} ELSE "RateLimitBucket"."windowStart" END,
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "RateLimitBucket"."expiresAt" END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count", "expiresAt"
  `;

  if ((rows[0]?.count ?? 1) > env.AUTH_RATE_LIMIT_ATTEMPTS) {
    throw new AppError(
      "CONFLICT",
      "Too many sign-in attempts. Please try again later.",
      429,
    );
  }
  return keyHash;
}

export async function clearLoginAttempts(keyHash: string): Promise<void> {
  await db.rateLimitBucket.deleteMany({ where: { keyHash } });
}

export async function consumeOperationAttempt(
  identifier: string,
  limit = 60,
  windowMs = 60_000,
  now = new Date(),
): Promise<void> {
  const keyHash = hashRateLimitKey(`operation:${identifier}`);
  const expiresAt = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("keyHash", "windowStart", "count", "expiresAt", "updatedAt")
    VALUES (${keyHash}, ${now}, 1, ${expiresAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("keyHash") DO UPDATE SET
      "windowStart" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now} ELSE "RateLimitBucket"."windowStart" END,
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "RateLimitBucket"."expiresAt" END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count"
  `;
  if ((rows[0]?.count ?? 1) > limit) {
    throw new AppError(
      "CONFLICT",
      "Too many requests. Try again shortly.",
      429,
    );
  }
}
