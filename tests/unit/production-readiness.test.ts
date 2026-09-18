import { describe, expect, it } from "vitest";

import { parseEnv } from "@/config/env";
import { productionReadinessIssues } from "@/config/production-readiness";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://service:secret@db.internal:5432/kdipl",
  APP_URL: "https://erp.kdipl.in",
  AUTH_SECRET: "a-unique-production-secret-over-32-characters",
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
        expect.stringContaining("TEST_DATABASE_URL"),
        expect.stringContaining("FILE_STORAGE_PROVIDER"),
      ]),
    );
    expect(errors.join(" ")).not.toContain("demo-password");
    expect(errors.join(" ")).not.toContain("user:password");
  });

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
});
