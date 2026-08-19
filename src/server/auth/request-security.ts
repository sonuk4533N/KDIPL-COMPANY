import "server-only";

import { headers } from "next/headers";

import { env } from "@/config/env";
import { AppError } from "@/server/errors/app-error";

export async function validateMutationOrigin(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return;

  const allowedOrigin = new URL(env.APP_URL).origin;
  if (new URL(origin).origin !== allowedOrigin) {
    throw new AppError(
      "FORBIDDEN",
      "The request origin could not be verified.",
    );
  }
}

export async function requestMetadata() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ip = forwardedFor ?? requestHeaders.get("x-real-ip") ?? "unknown";
  return {
    ip,
    userAgent: requestHeaders.get("user-agent"),
  };
}
