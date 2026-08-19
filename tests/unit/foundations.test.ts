import { describe, expect, it } from "vitest";

import { sanitizeAuditValue } from "@/server/audit/audit-service";
import { calculateSessionExpiry } from "@/server/auth/session";
import { AppError, toCommandError } from "@/server/errors/app-error";
import { validateUpload } from "@/server/storage/storage";
import { formatTransactionNumber } from "@/server/transactions/transaction-number-service";

describe("server foundations", () => {
  it("redacts secrets from nested audit payloads", () => {
    expect(
      sanitizeAuditValue({
        email: "a@b.test",
        nested: { password: "secret", tokenHash: "hash" },
      }),
    ).toEqual({
      email: "a@b.test",
      nested: { password: "[REDACTED]", tokenHash: "[REDACTED]" },
    });
  });

  it("maps structured errors without internal details", () => {
    expect(toCommandError(new AppError("FORBIDDEN"))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(toCommandError(new Error("database secret"))).toEqual({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    });
  });

  it("formats calendar-year transaction identifiers", () => {
    expect(formatTransactionNumber("mr", 2026, 7)).toBe("MR-2026-0007");
    expect(() =>
      formatTransactionNumber("invalid-prefix", 2026, 1),
    ).toThrowError(AppError);
  });

  it("calculates absolute and idle session expiry", () => {
    const now = new Date("2026-08-19T00:00:00.000Z");
    const expiry = calculateSessionExpiry(now);
    expect(expiry.absoluteExpiresAt.toISOString()).toBe(
      "2026-08-19T12:00:00.000Z",
    );
    expect(expiry.idleExpiresAt.toISOString()).toBe("2026-08-19T02:00:00.000Z");
  });

  it("validates file MIME, extension, and size together", () => {
    expect(() =>
      validateUpload({
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        size: 100,
        documentType: "GST_INVOICE",
      }),
    ).not.toThrow();
    expect(() =>
      validateUpload({
        filename: "invoice.exe",
        mimeType: "application/pdf",
        size: 100,
        documentType: "GST_INVOICE",
      }),
    ).toThrowError(AppError);
    expect(() =>
      validateUpload({
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        size: 100,
        documentType: "../INVOICE",
      }),
    ).toThrowError(AppError);
  });
});
