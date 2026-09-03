import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

const created = {
  stockTransactionIds: [] as string[],
  locationIds: [] as string[],
  materialIds: [] as string[],
  categoryIds: [] as string[],
  unitIds: [] as string[],
  siteIds: [] as string[],
  projectIds: [] as string[],
  clientIds: [] as string[],
  userIds: [] as string[],
};

describe.skipIf(!enabled)("Phase 5 inventory foundation", () => {
  afterEach(async () => {
    await testDb!.$transaction([
      testDb!.stockTransaction.deleteMany({
        where: { id: { in: created.stockTransactionIds } },
      }),
      testDb!.inventoryLocation.deleteMany({
        where: { id: { in: created.locationIds } },
      }),
      testDb!.material.deleteMany({
        where: { id: { in: created.materialIds } },
      }),
      testDb!.materialCategory.deleteMany({
        where: { id: { in: created.categoryIds } },
      }),
      testDb!.unitOfMeasure.deleteMany({
        where: { id: { in: created.unitIds } },
      }),
      testDb!.site.deleteMany({ where: { id: { in: created.siteIds } } }),
      testDb!.project.deleteMany({
        where: { id: { in: created.projectIds } },
      }),
      testDb!.client.deleteMany({ where: { id: { in: created.clientIds } } }),
      testDb!.user.deleteMany({ where: { id: { in: created.userIds } } }),
    ]);

    for (const ids of Object.values(created)) ids.length = 0;
  });

  afterAll(async () => testDb?.$disconnect());

  it("enforces central, project, and site store scope", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const client = await testDb!.client.create({
      data: { clientCode: `P5C-${tag}`, name: `Phase 5 Client ${tag}` },
    });
    created.clientIds.push(client.id);

    const projects = await Promise.all(
      ["A", "B"].map((suffix) =>
        testDb!.project.create({
          data: {
            projectCode: `P5P-${tag}-${suffix}`,
            name: `Phase 5 Project ${tag} ${suffix}`,
            clientId: client.id,
            location: "Gurugram",
            status: "ACTIVE",
          },
        }),
      ),
    );
    created.projectIds.push(...projects.map(({ id }) => id));

    const site = await testDb!.site.create({
      data: {
        projectId: projects[0].id,
        siteCode: "P5-SITE",
        name: "Phase 5 Site",
        location: "Gurugram",
        status: "ACTIVE",
      },
    });
    created.siteIds.push(site.id);

    const centralStore = await testDb!.inventoryLocation.create({
      data: {
        locationCode: `P5-CENTRAL-${tag}`,
        name: "Phase 5 Central Store",
        type: "CENTRAL_STORE",
      },
    });
    const projectStore = await testDb!.inventoryLocation.create({
      data: {
        locationCode: `P5-PROJECT-${tag}`,
        name: "Phase 5 Project Store",
        type: "PROJECT_STORE",
        projectId: projects[0].id,
      },
    });
    const siteStore = await testDb!.inventoryLocation.create({
      data: {
        locationCode: `P5-SITE-${tag}`,
        name: "Phase 5 Site Store",
        type: "SITE_STORE",
        projectId: projects[0].id,
        siteId: site.id,
      },
      include: { project: true, site: true },
    });
    created.locationIds.push(centralStore.id, projectStore.id, siteStore.id);

    expect(siteStore).toMatchObject({
      type: "SITE_STORE",
      project: { id: projects[0].id },
      site: { id: site.id },
    });

    await expect(
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P5-MISMATCH-${tag}`,
          name: "Mismatched Site Store",
          type: "SITE_STORE",
          projectId: projects[1].id,
          siteId: site.id,
        },
      }),
    ).rejects.toThrow();

    await expect(
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P5-INVALID-${tag}`,
          name: "Unscoped Project Store",
          type: "PROJECT_STORE",
        },
      }),
    ).rejects.toThrow();
  });

  it("derives stock balance from immutable ledger directions and reversals", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const [category, unit, user] = await Promise.all([
      testDb!.materialCategory.create({
        data: { code: `P5CAT-${tag}`, name: `Phase 5 Category ${tag}` },
      }),
      testDb!.unitOfMeasure.create({
        data: { code: `P5U-${tag}`, name: `Phase 5 Unit ${tag}`, symbol: "p5" },
      }),
      testDb!.user.create({
        data: {
          email: `p5-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p5-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: "Phase 5 Store Keeper",
        },
      }),
    ]);
    created.categoryIds.push(category.id);
    created.unitIds.push(unit.id);
    created.userIds.push(user.id);

    const material = await testDb!.material.create({
      data: {
        materialCode: `P5M-${tag}`,
        name: `Phase 5 Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
      },
    });
    created.materialIds.push(material.id);

    const location = await testDb!.inventoryLocation.create({
      data: {
        locationCode: `P5-LEDGER-${tag}`,
        name: "Phase 5 Ledger Store",
        type: "CENTRAL_STORE",
      },
    });
    created.locationIds.push(location.id);

    const opening = await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `STK-${tag}-01`,
        type: "OPENING",
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        quantity: "10.000",
        createdById: user.id,
      },
    });
    const issue = await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `STK-${tag}-02`,
        type: "ISSUE",
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        quantity: "3.000",
        createdById: user.id,
      },
    });
    created.stockTransactionIds.push(opening.id, issue.id);

    const beforeReversal = await testDb!.$queryRaw<
      { quantityOnHand: string }[]
    >`
      SELECT "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" = ${location.id}::uuid
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${unit.id}::uuid
    `;
    expect(beforeReversal).toEqual([{ quantityOnHand: "7.000" }]);

    const reversal = await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `STK-${tag}-03`,
        type: "REVERSAL",
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        quantity: "3.000",
        reversalOfId: issue.id,
        reason: "Reverse test issue",
        createdById: user.id,
      },
    });
    created.stockTransactionIds.push(reversal.id);

    const afterReversal = await testDb!.$queryRaw<{ quantityOnHand: string }[]>`
      SELECT "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" = ${location.id}::uuid
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${unit.id}::uuid
    `;
    expect(afterReversal).toEqual([{ quantityOnHand: "10.000" }]);
  });
});
