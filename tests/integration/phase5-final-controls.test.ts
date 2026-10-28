import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && Boolean(testDatabaseUrl);
const testDb =
  enabled && testDatabaseUrl
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
      })
    : null;

describe.skipIf(!enabled)("Phase 5 final customer controls", () => {
  afterAll(async () => testDb?.$disconnect());

  it("allows only a Store Keeper to create tracked temporary negative stock", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const [material, storeKeeper, unauthorizedUser] = await Promise.all([
      testDb!.material.findFirstOrThrow(),
      testDb!.user.findFirstOrThrow({
        where: {
          roles: { some: { role: { code: "STORE_KEEPER", isActive: true } } },
        },
      }),
      testDb!.user.create({
        data: {
          email: `p5-negative-${tag}@kdipl.test`,
          emailNormalized: `p5-negative-${tag}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: `Unauthorized stock actor ${tag}`,
        },
      }),
    ]);
    const location = await testDb!.inventoryLocation.create({
      data: {
        locationCode: `P5-NEG-${tag}`,
        name: `Negative-stock test ${tag}`,
        type: "CENTRAL_STORE",
      },
    });

    await expect(
      testDb!.stockTransaction.create({
        data: {
          transactionNumber: `NEG-U-${tag}`,
          type: "ISSUE",
          locationId: location.id,
          materialId: material.id,
          unitId: material.defaultUnitId,
          quantity: "1.000",
          reason: "Unauthorized temporary negative stock",
          createdById: unauthorizedUser.id,
        },
      }),
    ).rejects.toThrow(/Store Keeper/i);

    const issue = await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `NEG-S-${tag}`,
        type: "ISSUE",
        locationId: location.id,
        materialId: material.id,
        unitId: material.defaultUnitId,
        quantity: "5.000",
        reason: "Emergency site issue pending receipt correction",
        createdById: storeKeeper.id,
      },
    });
    const openException =
      await testDb!.temporaryNegativeStockException.findUniqueOrThrow({
        where: { sourceTransactionId: issue.id },
      });
    expect(openException).toMatchObject({
      status: "OPEN",
      createdById: storeKeeper.id,
    });
    expect(openException.deficitQuantity.toString()).toBe("5");
    expect(openException.resolutionDueAt.getUTCDay()).not.toBe(0);
    expect(openException.resolutionDueAt.getUTCDay()).not.toBe(6);

    const reversal = await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `NEG-R-${tag}`,
        type: "REVERSAL",
        locationId: location.id,
        materialId: material.id,
        unitId: material.defaultUnitId,
        quantity: "5.000",
        reversalOfId: issue.id,
        reason: "Correct emergency negative issue",
        createdById: storeKeeper.id,
      },
    });
    const resolved =
      await testDb!.temporaryNegativeStockException.findUniqueOrThrow({
        where: { sourceTransactionId: issue.id },
      });
    expect(resolved).toMatchObject({
      status: "RESOLVED",
      resolutionTransactionId: reversal.id,
    });
    expect(resolved.resolvedAt).not.toBeNull();
  });
});
