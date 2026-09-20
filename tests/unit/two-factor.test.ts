import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  generateTotpUri,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  verifyTotpCode,
} from "../../src/server/auth/totp";

describe("Two-Factor Authentication (TOTP - RFC 6238)", () => {
  it("encodes and decodes Base32 correctly", () => {
    const raw = new TextEncoder().encode("KDIPL-TEST-SECRET-12345");
    const encoded = base32Encode(raw);
    expect(encoded).toBeTruthy();
    expect(encoded).toMatch(/^[A-Z2-7]+$/);

    const decoded = base32Decode(encoded);
    expect(new TextDecoder().decode(decoded)).toBe("KDIPL-TEST-SECRET-12345");
  });

  it("generates random Base32 secrets with appropriate length", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBe(32); // 20 bytes * 8 / 5 = 32 chars
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("generates deterministic 6-digit TOTP code for a known secret and timestamp", () => {
    // Known test vector
    const secret = "JBSWY3DPEHPK3PXP"; // "Hello!\xde\xad\xbe\xef" in base32
    const timestamp = 1700000010000; // 1700000010s % 30s = 0s boundary
    // 1700000010000 / 1000 = 1700000010. 1700000010 / 30 = 56666667 exactly.
    const code = generateTotpCode(secret, timestamp);

    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);

    // Should generate identical code for the same time window (within 30s)
    const codeSameWindow = generateTotpCode(secret, timestamp + 10000);
    expect(codeSameWindow).toBe(code);

    // Verifies successfully
    expect(verifyTotpCode(secret, code, { timestamp })).toBe(true);
  });

  it("allows 1-step clock skew backward and forward by default", () => {
    const secret = generateTotpSecret();
    const now = 1715000000000;
    const codeNow = generateTotpCode(secret, now);

    // 25 seconds later (same step or adjacent step)
    expect(verifyTotpCode(secret, codeNow, { timestamp: now + 25000 })).toBe(
      true,
    );

    // 35 seconds earlier (1 step skew)
    const codePast = generateTotpCode(secret, now - 30000);
    expect(verifyTotpCode(secret, codePast, { timestamp: now })).toBe(true);

    // 35 seconds later (1 step skew forward)
    const codeFuture = generateTotpCode(secret, now + 30000);
    expect(verifyTotpCode(secret, codeFuture, { timestamp: now })).toBe(true);

    // 3 steps in the past (beyond window=1) should be rejected
    const codeTooOld = generateTotpCode(secret, now - 90000);
    expect(verifyTotpCode(secret, codeTooOld, { timestamp: now })).toBe(false);
  });

  it("rejects malformed and incorrect codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "")).toBe(false);
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, "abcdef")).toBe(false);
    expect(verifyTotpCode(secret, "000000", { timestamp: Date.now() })).toBe(
      false,
    );
  });

  it("generates correct otpauth:// URI", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const uri = generateTotpUri({
      issuer: "KDIPL ERP",
      accountName: "admin@kdipl.in",
      secret,
    });

    expect(uri).toContain("otpauth://totp/KDIPL%20ERP:admin%40kdipl.in");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=KDIPL%20ERP");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("generates and verifies single-use backup recovery codes", () => {
    const { rawCodes, hashedCodes } = generateBackupCodes(4);
    expect(rawCodes).toHaveLength(4);
    expect(hashedCodes).toHaveLength(4);

    const firstRaw = rawCodes[0]!;
    const firstHashed = hashedCodes[0]!;
    expect(hashBackupCode(firstRaw)).toBe(firstHashed);

    // Verify and consume the first code
    const consumed = verifyAndConsumeBackupCode(firstRaw, hashedCodes);
    expect(consumed.valid).toBe(true);
    expect(consumed.remainingHashedCodes).toHaveLength(3);
    expect(consumed.remainingHashedCodes).not.toContain(firstHashed);

    // Trying to reuse the consumed code must fail
    const reuseAttempt = verifyAndConsumeBackupCode(
      firstRaw,
      consumed.remainingHashedCodes,
    );
    expect(reuseAttempt.valid).toBe(false);
    expect(reuseAttempt.remainingHashedCodes).toHaveLength(3);
  });

  it("accurately identifies all privileged business and system roles", async () => {
    const { isPrivilegedRole, PRIVILEGED_ROLE_CODES } =
      await import("../../src/features/auth/two-factor-service");

    expect(PRIVILEGED_ROLE_CODES).toContain("SYSTEM_ADMINISTRATOR");
    expect(PRIVILEGED_ROLE_CODES).toContain("ACCOUNTS");
    expect(PRIVILEGED_ROLE_CODES).toContain("ACCOUNTS_ADMIN");
    expect(PRIVILEGED_ROLE_CODES).toContain("MANAGING_DIRECTOR");
    expect(PRIVILEGED_ROLE_CODES).toContain("PROJECT_DIRECTOR");
    expect(PRIVILEGED_ROLE_CODES).toContain("BUSINESS_DEVELOPMENT_DIRECTOR");

    expect(isPrivilegedRole(["SYSTEM_ADMINISTRATOR"])).toBe(true);
    expect(isPrivilegedRole(["ACCOUNTS"])).toBe(true);
    expect(isPrivilegedRole(["MANAGING_DIRECTOR"])).toBe(true);
    expect(isPrivilegedRole(["STORE_KEEPER", "SITE_SUPERVISOR"])).toBe(false);
    expect(isPrivilegedRole(["PROJECT_MANAGER"])).toBe(false);
  });

  it("issues and validates signed 2FA login challenge tokens", async () => {
    const { createTwoFactorChallengeToken, verifyTwoFactorChallengeToken } =
      await import("../../src/features/auth/two-factor-service");

    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const token = createTwoFactorChallengeToken(userId, true);

    expect(token).toBeTruthy();
    const verified = verifyTwoFactorChallengeToken(token);
    expect(verified.userId).toBe(userId);
    expect(verified.isEnrolling).toBe(true);
    expect(verified.exp).toBeGreaterThan(Date.now());

    // Tampered token fails validation
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(() => verifyTwoFactorChallengeToken(tampered)).toThrow();
  });
});
