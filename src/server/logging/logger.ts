import "server-only";

import pino from "pino";

import { env } from "@/config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "kdipl-operations-platform", environment: env.NODE_ENV },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "tokenHash",
      "authorization",
      "cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "AUTH_SECRET",
      "FILE_STORAGE_SECRET_ACCESS_KEY",
      "documentContents",
    ],
    censor: "[REDACTED]",
  },
});
