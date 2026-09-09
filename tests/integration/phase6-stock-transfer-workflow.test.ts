import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { getInventoryWorkspace } from "../../src/features/inventory/inventory-queries";
import { StockTransferService } from "../../src/features/inventory/stock-transfer-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "../../src/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

describe.skipIf(!enabled)("Phase 6 stock transfer workflow", () => {
  afterAll(async () => testDb?.$disconnect());

  it("keeps dispatched stock in transit and enforces destination receipt scope", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const [category, unit, client, supervisorEmployee, otherEmployee] =
      await Promise.all([
        testDb!.materialCategory.create({
          data: {
            code: `P6TC-${tag}`,
            name: `Phase 6 Transfer Category ${tag}`,
          },
        }),
        testDb!.unitOfMeasure.create({
          data: {
            code: `P6TU-${tag}`,
            name: `Phase 6 Transfer Unit ${tag}`,
            symbol: "p6t",
          },
        }),
        testDb!.client.create({
          data: { clientCode: `P6TCL-${tag}`, name: `Phase 6 Client ${tag}` },
        }),
        testDb!.employee.create({
          data: {
            employeeCode: `P6TSS-${tag}`,
            fullName: "Assigned Transfer Supervisor",
          },
        }),
        testDb!.employee.create({
          data: {
            employeeCode: `P6TO-${tag}`,
            fullName: "Unassigned Transfer Supervisor",
          },
        }),
      ]);
    const [storeKeeperUser, supervisorUser, otherUser, material, project] =
      await Promise.all([
        testDb!.user.create({
          data: {
            email: `p6-transfer-store-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-transfer-store-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: "Transfer Store Keeper",
          },
        }),
        testDb!.user.create({
          data: {
            email: `p6-transfer-supervisor-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-transfer-supervisor-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: supervisorEmployee.fullName,
            employeeId: supervisorEmployee.id,
          },
        }),
        testDb!.user.create({
          data: {
            email: `p6-transfer-other-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-transfer-other-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: otherEmployee.fullName,
            employeeId: otherEmployee.id,
          },
        }),
        testDb!.material.create({
          data: {
            materialCode: `P6TM-${tag}`,
            name: `Phase 6 Transfer Material ${tag}`,
            categoryId: category.id,
            defaultUnitId: unit.id,
          },
        }),
        testDb!.project.create({
          data: {
            projectCode: `P6TP-${tag}`,
            name: `Phase 6 Transfer Project ${tag}`,
            clientId: client.id,
            location: "Gurugram",
            status: "ACTIVE",
          },
        }),
      ]);
    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: `P6TS-${tag}`,
        name: `Phase 6 Transfer Site ${tag}`,
        location: "Gurugram",
        status: "ACTIVE",
      },
    });
    await testDb!.siteAssignment.create({
      data: {
        siteId: site.id,
        employeeId: supervisorEmployee.id,
        role: "SITE_SUPERVISOR",
        isActive: true,
      },
    });
    const [source, destination] = await Promise.all([
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P6T-SOURCE-${tag}`,
          name: "Phase 6 Transfer Source",
          type: "CENTRAL_STORE",
        },
      }),
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P6T-DEST-${tag}`,
          name: "Phase 6 Transfer Destination",
          type: "SITE_STORE",
          projectId: project.id,
          siteId: site.id,
        },
      }),
    ]);
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6T-OPEN-${tag}`,
        type: "OPENING",
        locationId: source.id,
        materialId: material.id,
        unitId: unit.id,
        quantity: "10.000",
        createdById: storeKeeperUser.id,
      },
    });

    const storeKeeper = {
      userId: storeKeeperUser.id,
      displayName: storeKeeperUser.displayName,
      email: storeKeeperUser.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["STORE_KEEPER"],
      permissions: ["inventory.view", "inventory.transfer"],
    } satisfies AuthenticatedPrincipal;
    const siteSupervisor = {
      userId: supervisorUser.id,
      displayName: supervisorUser.displayName,
      email: supervisorUser.email,
      employeeId: supervisorEmployee.id,
      mustChangePassword: false,
      roleCodes: ["SITE_SUPERVISOR"],
      permissions: ["inventory.view", "inventory.transfer"],
    } satisfies AuthenticatedPrincipal;
    const unassignedSupervisor = {
      ...siteSupervisor,
      userId: otherUser.id,
      displayName: otherUser.displayName,
      email: otherUser.email,
      employeeId: otherEmployee.id,
    } satisfies AuthenticatedPrincipal;
    const administrator = {
      ...storeKeeper,
      roleCodes: ["SYSTEM_ADMINISTRATOR"],
    } satisfies AuthenticatedPrincipal;

    await expect(
      StockTransferService.createDraft(administrator, {
        sourceLocationId: source.id,
        destinationLocationId: destination.id,
        materialId: material.id,
        unitId: unit.id,
        quantity: 4,
        purpose: "ROUTINE",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const draft = await StockTransferService.createDraft(storeKeeper, {
      sourceLocationId: source.id,
      destinationLocationId: destination.id,
      materialId: material.id,
      unitId: unit.id,
      quantity: 4,
      purpose: "ROUTINE",
      notes: "Send to assigned project store",
    });
    await StockTransferService.dispatch(storeKeeper, draft.id);
    await expect(
      StockTransferService.dispatch(storeKeeper, draft.id),
    ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });

    const afterDispatch = await testDb!.$queryRaw<
      Array<{ locationId: string; quantityOnHand: string }>
    >`
      SELECT "locationId", "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" IN (${source.id}::uuid, ${destination.id}::uuid)
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${unit.id}::uuid
      ORDER BY "locationId"
    `;
    expect(afterDispatch).toEqual([
      { locationId: source.id, quantityOnHand: "6.000" },
    ]);

    await expect(
      StockTransferService.receive(unassignedSupervisor, draft.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await StockTransferService.receive(siteSupervisor, draft.id);
    await expect(
      StockTransferService.receive(siteSupervisor, draft.id),
    ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });

    const receivedBalance = await testDb!.$queryRaw<
      Array<{ quantityOnHand: string }>
    >`
      SELECT "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" = ${destination.id}::uuid
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${unit.id}::uuid
    `;
    expect(receivedBalance).toEqual([{ quantityOnHand: "4.000" }]);

    const [persisted, transactions, audits, assignedWorkspace, otherWorkspace] =
      await Promise.all([
        testDb!.stockTransfer.findUniqueOrThrow({ where: { id: draft.id } }),
        testDb!.stockTransaction.findMany({
          where: { stockTransferLine: { stockTransferId: draft.id } },
          orderBy: { type: "asc" },
        }),
        testDb!.auditLog.findMany({
          where: { entityType: "StockTransfer", entityId: draft.id },
        }),
        getInventoryWorkspace(siteSupervisor),
        getInventoryWorkspace(unassignedSupervisor),
      ]);
    expect(persisted.status).toBe("RECEIVED");
    expect(transactions.map(({ type }) => type).sort()).toEqual([
      "TRANSFER_IN",
      "TRANSFER_OUT",
    ]);
    expect(audits.map(({ action }) => action)).toEqual([
      "CREATE",
      "TRANSFER",
      "RECEIVE",
    ]);
    expect(assignedWorkspace.stockTransfers.map(({ id }) => id)).toContain(
      draft.id,
    );
    expect(otherWorkspace.stockTransfers.map(({ id }) => id)).not.toContain(
      draft.id,
    );

    const cancelled = await StockTransferService.createDraft(storeKeeper, {
      sourceLocationId: source.id,
      destinationLocationId: destination.id,
      materialId: material.id,
      unitId: unit.id,
      quantity: 1,
      purpose: "PROJECT_CLOSE",
    });
    await StockTransferService.cancelDraft(storeKeeper, {
      stockTransferId: cancelled.id,
      reason: "Disposition plan changed",
    });
    expect(
      await testDb!.stockTransfer.findUniqueOrThrow({
        where: { id: cancelled.id },
        select: { status: true, cancellationReason: true },
      }),
    ).toEqual({
      status: "CANCELLED",
      cancellationReason: "Disposition plan changed",
    });
  });

  it("grants stock-transfer permission to operational inventory roles", async () => {
    const grants = await testDb!.rolePermission.findMany({
      where: {
        role: { code: { in: ["STORE_KEEPER", "SITE_SUPERVISOR"] } },
        permission: { code: "inventory.transfer" },
      },
      include: { role: true },
    });
    expect(grants.map(({ role }) => role.code).sort()).toEqual([
      "SITE_SUPERVISOR",
      "STORE_KEEPER",
    ]);
  });
});
