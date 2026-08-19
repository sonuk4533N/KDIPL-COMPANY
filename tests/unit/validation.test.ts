import { describe, expect, it } from "vitest";

import { loginSchema } from "@/features/auth/login-schema";

describe("login validation", () => {
  it("normalizes a valid email", () => {
    expect(
      loginSchema.parse({ email: " Admin@KDIPL.COM ", password: "password" })
        .email,
    ).toBe("admin@kdipl.com");
  });

  it("returns field errors for invalid input", () => {
    const result = loginSchema.safeParse({ email: "invalid", password: "" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.flatten().fieldErrors).toMatchObject({
        email: expect.any(Array),
        password: expect.any(Array),
      });
  });
});
