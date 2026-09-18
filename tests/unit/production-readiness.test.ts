import { describe, expect, it } from "vitest";

import { parseEnv } from "@/config/env";
import { productionReadinessIssues } from "@/config/production-readiness";

const production = {
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://kdipl_service:9Vx2mQ7wL4pR8tN5@db.internal:5432/kdipl?sslmode=verify-full",
  APP_URL: "https://erp.kdipl.in",
  RELEASE_SHA: "0123456789abcdef0123456789abcdef01234567",
  AUTH_SECRET: "j8S2xN5vQ9cF4mL7rT1yH6kP3wD0aZ8uB5eG2iJ9oC4sV7nM",
  FILE_STORAGE_PROVIDER: "s3",
  FILE_STORAGE_BUCKET: "kdipl-production-documents",
  FILE_STORAGE_REGION: "ap-south-1",
};

describe("production configuration gate", () => {
  it("accepts configured production services without printing secrets", () => {
    expect(productionReadinessIssues(parseEnv(production))).toEqual([]);
  });

  it("rejects development settings and includes only field names in errors", () => {
    const config = parseEnv({
      ...production,
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
      RELEASE_SHA: "",
      AUTH_SECRET: "replace-with-at-least-32-random-characters",
      TEST_DATABASE_URL: "postgresql://user:password@localhost:5432/test",
      BOOTSTRAP_ADMIN_EMAIL: "admin@kdipl.test",
      FILE_STORAGE_PROVIDER: "local",
    });
    const errors = productionReadinessIssues(config, {
      demoBusinessPassword: "demo-password",
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("NODE_ENV"),
        expect.stringContaining("APP_URL"),
        expect.stringContaining("AUTH_SECRET"),
        expect.stringContaining("RELEASE_SHA"),
        expect.stringContaining("TEST_DATABASE_URL"),
        expect.stringContaining("FILE_STORAGE_PROVIDER"),
      ]),
    );
    expect(errors.join(" ")).not.toContain("demo-password");
    expect(errors.join(" ")).not.toContain("user:password");
  });

  it("rejects an untraceable release, unsafe session policy and verbose logs", () => {
    const errors = productionReadinessIssues(
      parseEnv({
        ...production,
        RELEASE_SHA: "main",
        SESSION_ABSOLUTE_HOURS: "48",
        SESSION_IDLE_MINUTES: "600",
        AUTH_RATE_LIMIT_ATTEMPTS: "50",
        AUTH_RATE_LIMIT_WINDOW_MINUTES: "120",
        LOG_LEVEL: "debug",
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("RELEASE_SHA"),
        expect.stringContaining("Session expiry"),
        expect.stringContaining("rate limits"),
        expect.stringContaining("LOG_LEVEL"),
      ]),
    );
  });

  it.each([
    "postgresql://user:credential@localhost:5432/kdipl?sslmode=require",
    "postgresql://user:credential@db.internal:5432/kdipl_test?sslmode=require",
    "postgresql://user:credential@db.internal:5432/kdipl?sslmode=disable",
  ])(
    "rejects an unsafe database target without leaking it: %s",
    (databaseUrl) => {
      const errors = productionReadinessIssues(
        parseEnv({ ...production, DATABASE_URL: databaseUrl }),
      );
      const output = errors.join(" ");

      expect(errors.length).toBeGreaterThan(0);
      expect(output).not.toContain(databaseUrl);
      expect(output).not.toContain("credential");
    },
  );

  it("rejects missing storage and an insecure object-storage endpoint", () => {
    const config = parseEnv({
      ...production,
      FILE_STORAGE_BUCKET: "",
      FILE_STORAGE_REGION: "",
      FILE_STORAGE_ENDPOINT: "http://objects.example.in",
    });
    const errors = productionReadinessIssues(config);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("FILE_STORAGE_BUCKET"),
        expect.stringContaining("FILE_STORAGE_REGION"),
        expect.stringContaining("FILE_STORAGE_ENDPOINT"),
      ]),
    );
  });

  it("rejects embedded endpoint credentials and partial storage credentials", () => {
    const errors = productionReadinessIssues(
      parseEnv({
        ...production,
        FILE_STORAGE_ENDPOINT: "https://key:value@objects.kdipl.in",
        FILE_STORAGE_ACCESS_KEY_ID: "configured-access-key",
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("credential-free"),
        expect.stringContaining("configured together"),
      ]),
    );
    expect(errors.join(" ")).not.toContain("key:value");
  });
});
