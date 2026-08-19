import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";
import { AuditAction } from "../../src/generated/prisma/enums";
import { AuditService } from "@/server/audit/audit-service";
import { consumeLoginAttempt } from "@/server/auth/rate-limit";
import {
  createSession,
  revokeSessionToken,
  validateSessionToken,
} from "@/server/auth/session";
import { TransactionNumberService } from "@/server/transactions/transaction-number-service";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
const connectionString =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

describe.skipIf(!enabled)("PostgreSQL foundation", () => {
  beforeEach(async () => {
    await testDb!.$transaction([
      testDb!.auditLog.deleteMany(),
      testDb!.session.deleteMany(),
      testDb!.userRole.deleteMany(),
      testDb!.rolePermission.deleteMany(),
      testDb!.user.deleteMany(),
      testDb!.permission.deleteMany(),
      testDb!.role.deleteMany(),
      testDb!.employee.deleteMany(),
      testDb!.department.deleteMany(),
      testDb!.businessSequence.deleteMany(),
      testDb!.rateLimitBucket.deleteMany(),
    ]);
  });
  afterAll(async () => testDb?.$disconnect());

  it("persists explicit foundational relations", async () => {
    const department = await testDb!.department.create({
      data: { code: "TEST", name: "Test Department" },
    });
    const employee = await testDb!.employee.create({
      data: {
        employeeCode: "EMP-TEST",
        fullName: "Test User",
        departmentId: department.id,
      },
    });
    const user = await testDb!.user.create({
      data: {
        email: "test@kdipl.test",
        emailNormalized: "test@kdipl.test",
        passwordHash: "test-hash",
        displayName: "Test User",
        employeeId: employee.id,
      },
    });
    expect(
      (
        await testDb!.user.findUnique({
          where: { id: user.id },
          include: { employee: { include: { department: true } } },
        })
      )?.employee?.department?.code,
    ).toBe("TEST");
  });

  it("writes audit data in the caller transaction and rolls it back on failure", async () => {
    await expect(
      testDb!.$transaction(async (transaction) => {
        await AuditService.record(
          {
            action: AuditAction.CREATE,
            entityType: "Test",
            entityId: randomUUID(),
            after: { password: "secret" },
          },
          transaction,
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await testDb!.auditLog.count()).toBe(0);
  });

  it("persists sanitized audit evidence", async () => {
    const entityId = randomUUID();
    await testDb!.$transaction((transaction) =>
      AuditService.record(
        {
          action: AuditAction.UPDATE,
          entityType: "Test",
          entityId,
          after: { value: "safe", password: "secret" },
        },
        transaction,
      ),
    );
    expect(await testDb!.auditLog.findFirstOrThrow({ where: { entityId } })).toMatchObject({
      action: "UPDATE",
      after: { value: "safe", password: "[REDACTED]" },
    });
  });

  it("generates unique human-readable numbers under concurrency", async () => {
    const values = await Promise.all(
      Array.from({ length: 8 }, () =>
        testDb!.$transaction((transaction) =>
          TransactionNumberService.next(
            "MR",
            new Date("2026-08-19T00:00:00Z"),
            transaction,
          ),
        ),
      ),
    );
    expect(new Set(values).size).toBe(8);
    expect(values.every((value) => /^MR-2026-\d{4}$/.test(value))).toBe(true);
  });

  it("creates, validates, and revokes opaque sessions", async () => {
    const email = `session-${randomUUID()}@kdipl.test`;
    const user = await testDb!.user.create({
      data: {
        email,
        emailNormalized: email,
        passwordHash: "test-hash",
        displayName: "Session Test",
      },
    });
    const created = await testDb!.$transaction((transaction) =>
      createSession(user.id, user.authVersion, {}, transaction),
    );
    expect(await validateSessionToken(created.token)).not.toBeNull();
    await revokeSessionToken(created.token);
    expect(await validateSessionToken(created.token)).toBeNull();
  });

  it("enforces the shared login-attempt limit", async () => {
    const identifier = `integration-${randomUUID()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(consumeLoginAttempt(identifier)).resolves.toMatch(/^[a-f0-9]{64}$/);
    }
    await expect(consumeLoginAttempt(identifier)).rejects.toMatchObject({ status: 429 });
  });
});
