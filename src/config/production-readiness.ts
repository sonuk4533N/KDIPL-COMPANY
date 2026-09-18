import type { AppEnvironment } from "./env";

/**
 * Checks values that can be verified without contacting production services.
 * Never include secrets or connection strings in returned messages.
 */
export function productionReadinessIssues(config: AppEnvironment): string[] {
  const issues: string[] = [];

  if (config.NODE_ENV !== "production") {
    issues.push("NODE_ENV must be production.");
  }

  const appUrl = new URL(config.APP_URL);
  if (
    appUrl.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(appUrl.hostname) ||
    appUrl.hostname.endsWith(".test")
  ) {
    issues.push("APP_URL must be a public HTTPS production URL.");
  }

  if (
    /replace-with|change[ -]?me|example|placeholder/i.test(
      config.AUTH_SECRET,
    )
  ) {
    issues.push("AUTH_SECRET must be a real production secret.");
  }

  if (
    config.BOOTSTRAP_ADMIN_EMAIL ||
    config.BOOTSTRAP_ADMIN_PASSWORD ||
    config.BOOTSTRAP_ADMIN_NAME ||
    process.env.DEMO_BUSINESS_PASSWORD
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
    }
  } catch {
    issues.push("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (config.FILE_STORAGE_PROVIDER !== "s3") {
    issues.push("Production document storage must use durable S3 storage.");
  } else {
    if (!config.FILE_STORAGE_BUCKET?.trim()) {
      issues.push("FILE_STORAGE_BUCKET is required for production.");
    }
    if (!config.FILE_STORAGE_REGION?.trim()) {
      issues.push("FILE_STORAGE_REGION is required for production.");
    }
    if (
      config.FILE_STORAGE_ENDPOINT &&
      new URL(config.FILE_STORAGE_ENDPOINT).protocol !== "https:"
    ) {
      issues.push("FILE_STORAGE_ENDPOINT must use HTTPS.");
    }
  }

  return issues;
}
