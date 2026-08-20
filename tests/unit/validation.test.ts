import { describe, expect, it } from "vitest";

import { loginSchema } from "@/features/auth/login-schema";
import {
  changePasswordSchema,
  passwordPolicySchema,
} from "@/features/auth/password-policy";

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

describe("password policy", () => {
  it("accepts a strong password and rejects missing character classes", () => {
    expect(passwordPolicySchema.safeParse("KDIPL-Strong!2026").success).toBe(
      true,
    );
    expect(passwordPolicySchema.safeParse("onlylowercase123").success).toBe(
      false,
    );
  });

  it("requires matching password confirmation", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "Current!Password1",
        newPassword: "KDIPL-Strong!2026",
        confirmPassword: "KDIPL-Strong!2027",
      }).success,
    ).toBe(false);
  });
});
