import type { AppEnvironment } from "./env";

const unsafeValuePattern =
  /replace-with|change[ -]?me|example|placeholder|dummy|default|password|secret/i;
const unsafeHostnames = new Set([
  "0.0.0.0",
  "127.0.0.1",
  "[::1]",
  "::1",
  "localhost",
]);

function isNonProductionHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    unsafeHostnames.has(normalized) ||
    normalized.startsWith("127.") ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".example") ||
    normalized.endsWith(".invalid")
  );
}

function hasCredentialPair(config: AppEnvironment): boolean {
  return Boolean(
    config.FILE_STORAGE_ACCESS_KEY_ID && config.FILE_STORAGE_SECRET_ACCESS_KEY,
  );
}

/**
 * Checks values that can be verified without contacting production services.
 * Never include secrets or connection strings in returned messages.
 */
export function productionReadinessIssues(
  config: AppEnvironment,
  options: { demoBusinessPassword?: string } = {},
): string[] {
  const issues: string[] = [];

  if (config.NODE_ENV !== "production") {
    issues.push("NODE_ENV must be production.");
  }

  const appUrl = new URL(config.APP_URL);
  if (
    appUrl.protocol !== "https:" ||
    isNonProductionHostname(appUrl.hostname) ||
    appUrl.username ||
    appUrl.password ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash
  ) {
    issues.push(
      "APP_URL must be a credential-free public HTTPS origin without a path, query or fragment.",
    );
  }

  if (
    config.AUTH_SECRET.length < 43 ||
    new Set(config.AUTH_SECRET).size < 12 ||
    unsafeValuePattern.test(config.AUTH_SECRET)
  ) {
    issues.push(
      "AUTH_SECRET must be a non-placeholder value with at least 32 bytes of random material.",
    );
  }

  if (!config.RELEASE_SHA || !/^[a-f0-9]{40}$/i.test(config.RELEASE_SHA)) {
    issues.push("RELEASE_SHA must identify the exact 40-character Git commit.");
  }

  if (
    config.SESSION_ABSOLUTE_HOURS > 24 ||
    config.SESSION_IDLE_MINUTES > 240 ||
    config.SESSION_IDLE_MINUTES > config.SESSION_ABSOLUTE_HOURS * 60
  ) {
    issues.push(
      "Session expiry must not exceed 24 absolute hours or four idle hours, and idle expiry must not exceed absolute expiry.",
    );
  }

  if (
    config.AUTH_RATE_LIMIT_ATTEMPTS > 10 ||
    config.AUTH_RATE_LIMIT_WINDOW_MINUTES > 60
  ) {
    issues.push(
      "Authentication rate limits must allow no more than 10 attempts in a window of at most 60 minutes.",
    );
  }

  if (["debug", "trace"].includes(config.LOG_LEVEL)) {
    issues.push(
      "LOG_LEVEL must not enable debug or trace output in production.",
    );
  }

  if (
    config.BOOTSTRAP_ADMIN_EMAIL ||
    config.BOOTSTRAP_ADMIN_PASSWORD ||
    config.BOOTSTRAP_ADMIN_NAME ||
    options.demoBusinessPassword
  ) {
    issues.push("Development bootstrap and demo credentials must be removed.");
  }

  if (config.TEST_DATABASE_URL) {
    issues.push("TEST_DATABASE_URL must not be configured in production.");
  }

  try {
    const databaseUrl = new URL(config.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
      issues.push("DATABASE_URL must use PostgreSQL.");
    } else {
      if (
        isNonProductionHostname(databaseUrl.hostname) ||
        !databaseUrl.username ||
        !databaseUrl.password
      ) {
        issues.push(
          "DATABASE_URL must use an authenticated non-development database host.",
        );
      }
      const databaseName = decodeURIComponent(databaseUrl.pathname)
        .replace(/^\//, "")
        .toLowerCase();
      if (!databaseName || /(^|[-_])test($|[-_])/.test(databaseName)) {
        issues.push("DATABASE_URL must name a non-test production database.");
      }
      if (
        !["require", "verify-ca", "verify-full"].includes(
          databaseUrl.searchParams.get("sslmode") ?? "",
        )
      ) {
        issues.push(
          "DATABASE_URL must require TLS with sslmode=require, verify-ca or verify-full.",
        );
      }
    }
  } catch {
    issues.push("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (config.FILE_STORAGE_PROVIDER !== "s3") {
    issues.push(
      "FILE_STORAGE_PROVIDER must use durable S3 storage in production.",
    );
  } else {
    if (!config.FILE_STORAGE_BUCKET?.trim()) {
      issues.push("FILE_STORAGE_BUCKET is required for production.");
    }
    if (!config.FILE_STORAGE_REGION?.trim()) {
      issues.push("FILE_STORAGE_REGION is required for production.");
    }
    if (
      !config.FILE_STORAGE_BUCKET?.trim() ||
      unsafeValuePattern.test(config.FILE_STORAGE_BUCKET)
    ) {
      issues.push("FILE_STORAGE_BUCKET must identify a production bucket.");
    }
    if (config.FILE_STORAGE_ENDPOINT) {
      const endpoint = new URL(config.FILE_STORAGE_ENDPOINT);
      if (
        endpoint.protocol !== "https:" ||
        isNonProductionHostname(endpoint.hostname) ||
        endpoint.username ||
        endpoint.password
      ) {
        issues.push(
          "FILE_STORAGE_ENDPOINT must be a credential-free production HTTPS endpoint.",
        );
      }
    }
    const hasAccessKey = Boolean(config.FILE_STORAGE_ACCESS_KEY_ID);
    const hasSecretKey = Boolean(config.FILE_STORAGE_SECRET_ACCESS_KEY);
    if (hasAccessKey !== hasSecretKey) {
      issues.push(
        "FILE_STORAGE_ACCESS_KEY_ID and FILE_STORAGE_SECRET_ACCESS_KEY must be configured together or omitted for workload identity.",
      );
    } else if (
      hasCredentialPair(config) &&
      (unsafeValuePattern.test(config.FILE_STORAGE_ACCESS_KEY_ID ?? "") ||
        unsafeValuePattern.test(config.FILE_STORAGE_SECRET_ACCESS_KEY ?? ""))
    ) {
      issues.push("Object-storage credentials must not be placeholders.");
    }
  }

  return issues;
}
