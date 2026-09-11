import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { StockCountService } from "../../src/features/inventory/stock-count-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "../../src/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

describe.skipIf(!enabled)("Phase 6 physical stock count workflow", () => {
  afterAll(async () => testDb?.$disconnect());

  it("posts exact approved variances and rejects stale count snapshots", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const [category, unit, storeUser, directorUser, administratorUser] =
      await Promise.all([
        testDb!.materialCategory.create({
          data: { code: `P6CC-${tag}`, name: `Count Category ${tag}` },
        }),
        testDb!.unitOfMeasure.create({
          data: {
            code: `P6CU-${tag}`,
            name: `Count Unit ${tag}`,
            symbol: "p6c",
          },
        }),
        testDb!.user.create({
          data: {
            email: `p6-count-store-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-count-store-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: "Count Store Keeper",
          },
        }),
        testDb!.user.create({
          data: {
            email: `p6-count-director-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-count-director-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: "Count Project Director",
          },
        }),
        testDb!.user.create({
          data: {
            email: `p6-count-admin-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-count-admin-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: "Count Administrator",
          },
        }),
      ]);
    const material = await testDb!.material.create({
      data: {
        materialCode: `P6CM-${tag}`,
        name: `Count Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
      },
    });
    const location = await testDb!.inventoryLocation.create({
      data: {
        locationCode: `P6C-LOC-${tag}`,
        name: `Count Location ${tag}`,
        type: "CENTRAL_STORE",
      },
    });
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6C-OPEN-${tag}`,
        type: "OPENING",
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        quantity: "10.000",
        createdById: storeUser.id,
      },
    });

    const storeKeeper = {
      userId: storeUser.id,
      displayName: storeUser.displayName,
      email: storeUser.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["STORE_KEEPER"],
      permissions: ["inventory.view", "inventory.count"],
    } satisfies AuthenticatedPrincipal;
    const projectDirector = {
      userId: directorUser.id,
      displayName: directorUser.displayName,
      email: directorUser.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["PROJECT_DIRECTOR"],
      permissions: ["inventory.view", "inventory.count"],
    } satisfies AuthenticatedPrincipal;
    const administrator = {
      userId: administratorUser.id,
      displayName: administratorUser.displayName,
      email: administratorUser.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["SYSTEM_ADMINISTRATOR"],
      permissions: ["inventory.view", "inventory.count"],
    } satisfies AuthenticatedPrincipal;

    await expect(
      StockCountService.createDraft(administrator, {
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        countedAt: new Date(),
        countedQuantity: 9,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const count = await StockCountService.createDraft(storeKeeper, {
      locationId: location.id,
      materialId: material.id,
      unitId: unit.id,
      countedAt: new Date(),
      countedQuantity: 7,
      notes: "Witnessed full physical count",
    });
    await StockCountService.submit(storeKeeper, count.id);
    await expect(
      StockCountService.post(storeKeeper, count.id),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    await StockCountService.decide(projectDirector, {
      stockCountId: count.id,
      decision: "APPROVE",
      notes: "Signed count sheet reviewed",
    });
    await StockCountService.post(storeKeeper, count.id);
    await expect(
      StockCountService.post(storeKeeper, count.id),
    ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });

    const [posted, balance, audits] = await Promise.all([
      testDb!.stockCount.findUniqueOrThrow({
        where: { id: count.id },
        include: { lines: { include: { stockTransaction: true } } },
      }),
      testDb!.$queryRaw<
        Array<{ quantityOnHand: string }>
      >`SELECT "quantityOnHand"::text AS "quantityOnHand" FROM "InventoryStockBalance" WHERE "locationId" = ${location.id}::uuid AND "materialId" = ${material.id}::uuid AND "unitId" = ${unit.id}::uuid`,
      testDb!.auditLog.findMany({
        where: { entityType: "StockCount", entityId: count.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    expect({
      bookQuantity: posted.lines[0].bookQuantity.toString(),
      countedQuantity: posted.lines[0].countedQuantity.toString(),
      varianceQuantity: posted.lines[0].varianceQuantity.toString(),
    }).toEqual({
      bookQuantity: "10",
      countedQuantity: "7",
      varianceQuantity: "-3",
    });
    expect(posted.lines[0].stockTransaction?.type).toBe("ADJUSTMENT_OUT");
    expect(posted.lines[0].stockTransaction?.quantity.toString()).toBe("3");
    expect(balance).toEqual([{ quantityOnHand: "7.000" }]);
    expect(audits.map(({ action }) => action)).toEqual([
      "CREATE",
      "SUBMIT",
      "APPROVE",
      "ADJUST",
    ]);

    const stale = await StockCountService.createDraft(storeKeeper, {
      locationId: location.id,
      materialId: material.id,
      unitId: unit.id,
      countedAt: new Date(),
      countedQuantity: 8,
    });
    await StockCountService.submit(storeKeeper, stale.id);
    await StockCountService.decide(projectDirector, {
      stockCountId: stale.id,
      decision: "APPROVE",
      notes: "Variance evidence reviewed",
    });
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6C-OPEN2-${tag}`,
        type: "OPENING",
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        quantity: "1.000",
        createdById: storeUser.id,
      },
    });
    await expect(
      StockCountService.post(storeKeeper, stale.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await testDb!.stockCount.findUniqueOrThrow({
        where: { id: stale.id },
        select: { status: true },
      }),
    ).toEqual({ status: "APPROVED" });
  });

  it("grants count duties to Store Keepers and Project Directors", async () => {
    const grants = await testDb!.rolePermission.findMany({
      where: {
        role: { code: { in: ["STORE_KEEPER", "PROJECT_DIRECTOR"] } },
        permission: { code: "inventory.count" },
      },
      include: { role: true },
    });
    expect(grants.map(({ role }) => role.code).sort()).toEqual([
      "PROJECT_DIRECTOR",
      "STORE_KEEPER",
    ]);
  });
});
