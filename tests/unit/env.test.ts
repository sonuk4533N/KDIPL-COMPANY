import { describe, expect, it } from "vitest";

import { parseEnv } from "@/config/env";

const valid = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/kdipl",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "a-secure-test-secret-that-is-over-32-characters",
};

describe("application environment", () => {
  it("loads valid configuration and applies safe defaults", () => {
    const parsed = parseEnv(valid);
    expect(parsed.SESSION_ABSOLUTE_HOURS).toBe(12);
    expect(parsed.SESSION_IDLE_MINUTES).toBe(120);
    expect(parsed.FILE_STORAGE_PROVIDER).toBe("local");
  });

  it("rejects missing database and weak auth secrets", () => {
    expect(() => parseEnv({ AUTH_SECRET: "short" })).toThrow(
      "Invalid application environment",
    );
  });
});
