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
import { CredentialService } from "@/features/auth/credential-service";
import { hashPassword, verifyPassword } from "@/server/auth/password";

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
      testDb!.position.deleteMany(),
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
    expect(
      await testDb!.auditLog.findFirstOrThrow({ where: { entityId } }),
    ).toMatchObject({
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
      await expect(consumeLoginAttempt(identifier)).resolves.toMatch(
        /^[a-f0-9]{64}$/,
      );
    }
    await expect(consumeLoginAttempt(identifier)).rejects.toMatchObject({
      status: 429,
    });
  });

  it("persists Phase 1 organization positions and multiple role assignments", async () => {
    const department = await testDb!.department.create({
      data: { code: "PHASE1", name: "Phase 1 Department" },
    });
    const position = await testDb!.position.create({
      data: {
        code: "PHASE1_MANAGER",
        name: "Phase 1 Manager",
        departmentId: department.id,
      },
    });
    const employee = await testDb!.employee.create({
      data: {
        employeeCode: "P1-001",
        fullName: "Phase One User",
        departmentId: department.id,
        positionId: position.id,
      },
    });
    const roles = await Promise.all([
      testDb!.role.create({ data: { code: "P1_A", name: "Phase One A" } }),
      testDb!.role.create({ data: { code: "P1_B", name: "Phase One B" } }),
    ]);
    const user = await testDb!.user.create({
      data: {
        email: "phase1@kdipl.test",
        emailNormalized: "phase1@kdipl.test",
        passwordHash: "test-hash",
        displayName: employee.fullName,
        employeeId: employee.id,
        mustChangePassword: true,
        roles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
      },
      include: {
        roles: true,
        employee: { include: { position: true } },
      },
    });
    expect(user.roles).toHaveLength(2);
    expect(user.employee?.position?.code).toBe("PHASE1_MANAGER");
    expect(user.mustChangePassword).toBe(true);
  });

  it("changes a temporary password while retaining only the current session", async () => {
    const currentPassword = "Temporary!Pass2026";
    const nextPassword = "Private!Pass2027";
    const user = await testDb!.user.create({
      data: {
        email: "credential@kdipl.test",
        emailNormalized: "credential@kdipl.test",
        passwordHash: await hashPassword(currentPassword),
        displayName: "Credential User",
        mustChangePassword: true,
      },
    });
    const [current, other] = await testDb!.$transaction(async (transaction) =>
      Promise.all([
        createSession(user.id, user.authVersion, {}, transaction),
        createSession(user.id, user.authVersion, {}, transaction),
      ]),
    );
    const appSession = await validateSessionToken(current.token);
    expect(appSession).not.toBeNull();
    await CredentialService.changeOwnPassword(appSession!, {
      currentPassword,
      newPassword: nextPassword,
      confirmPassword: nextPassword,
    });
    const updated = await testDb!.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updated.mustChangePassword).toBe(false);
    expect(await verifyPassword(updated.passwordHash, nextPassword)).toBe(true);
    expect(await validateSessionToken(current.token)).not.toBeNull();
    expect(await validateSessionToken(other.token)).toBeNull();
    expect(
      await testDb!.auditLog.count({
        where: { entityType: "UserCredential", entityId: user.id },
      }),
    ).toBe(1);
  });
});
