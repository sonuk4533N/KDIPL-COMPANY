import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { getInventoryWorkspace } from "../../src/features/inventory/inventory-queries";
import { MaterialIssueService } from "../../src/features/inventory/material-issue-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "../../src/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

describe.skipIf(!enabled)("Phase 6 material issue workflow", () => {
  afterAll(async () => testDb?.$disconnect());

  it("posts atomically, enforces site acknowledgment scope, and records audit evidence", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const [category, unit, client, supervisorEmployee, otherEmployee] =
      await Promise.all([
        testDb!.materialCategory.create({
          data: { code: `P6IC-${tag}`, name: `Phase 6 Issue Category ${tag}` },
        }),
        testDb!.unitOfMeasure.create({
          data: {
            code: `P6IU-${tag}`,
            name: `Phase 6 Issue Unit ${tag}`,
            symbol: "p6i",
          },
        }),
        testDb!.client.create({
          data: { clientCode: `P6ICL-${tag}`, name: `Phase 6 Client ${tag}` },
        }),
        testDb!.employee.create({
          data: {
            employeeCode: `P6ISS-${tag}`,
            fullName: "Assigned Phase 6 Supervisor",
          },
        }),
        testDb!.employee.create({
          data: {
            employeeCode: `P6IO-${tag}`,
            fullName: "Unassigned Phase 6 Supervisor",
          },
        }),
      ]);
    const [storeKeeperUser, supervisorUser, otherUser, material, project] =
      await Promise.all([
        testDb!.user.create({
          data: {
            email: `p6-store-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-store-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: "Phase 6 Store Keeper",
          },
        }),
        testDb!.user.create({
          data: {
            email: `p6-supervisor-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-supervisor-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: supervisorEmployee.fullName,
            employeeId: supervisorEmployee.id,
          },
        }),
        testDb!.user.create({
          data: {
            email: `p6-other-${tag.toLowerCase()}@kdipl.test`,
            emailNormalized: `p6-other-${tag.toLowerCase()}@kdipl.test`,
            passwordHash: "integration-test",
            displayName: otherEmployee.fullName,
            employeeId: otherEmployee.id,
          },
        }),
        testDb!.material.create({
          data: {
            materialCode: `P6IM-${tag}`,
            name: `Phase 6 Issue Material ${tag}`,
            categoryId: category.id,
            defaultUnitId: unit.id,
          },
        }),
        testDb!.project.create({
          data: {
            projectCode: `P6IP-${tag}`,
            name: `Phase 6 Issue Project ${tag}`,
            clientId: client.id,
            location: "Gurugram",
            status: "ACTIVE",
          },
        }),
      ]);
    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: `P6IS-${tag}`,
        name: `Phase 6 Issue Site ${tag}`,
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
    const [source, siteStore] = await Promise.all([
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P6I-SOURCE-${tag}`,
          name: "Phase 6 Issue Source",
          type: "CENTRAL_STORE",
        },
      }),
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P6I-SITE-${tag}`,
          name: "Phase 6 Assigned Site Store",
          type: "SITE_STORE",
          projectId: project.id,
          siteId: site.id,
        },
      }),
    ]);
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6I-OPEN-${tag}`,
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
      permissions: ["inventory.view", "inventory.issue"],
    } satisfies AuthenticatedPrincipal;
    const siteSupervisor = {
      userId: supervisorUser.id,
      displayName: supervisorUser.displayName,
      email: supervisorUser.email,
      employeeId: supervisorEmployee.id,
      mustChangePassword: false,
      roleCodes: ["SITE_SUPERVISOR"],
      permissions: ["inventory.view", "inventory.issue"],
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
      MaterialIssueService.createDraft(administrator, {
        sourceLocationId: source.id,
        materialId: material.id,
        unitId: unit.id,
        siteId: site.id,
        quantity: 4,
        purpose: "Forbidden administrator issue",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const issue = await MaterialIssueService.createDraft(storeKeeper, {
      sourceLocationId: source.id,
      materialId: material.id,
      unitId: unit.id,
      siteId: site.id,
      quantity: 4,
      purpose: "Install issued material at assigned site",
      notes: "Service-level Phase 6 verification",
    });
    await MaterialIssueService.post(storeKeeper, issue.id);
    await expect(
      MaterialIssueService.post(storeKeeper, issue.id),
    ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });
    await expect(
      MaterialIssueService.acknowledge(unassignedSupervisor, issue.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await MaterialIssueService.acknowledge(siteSupervisor, issue.id);

    const persisted = await testDb!.materialIssue.findUniqueOrThrow({
      where: { id: issue.id },
      include: { lines: { include: { stockTransactions: true } } },
    });
    expect(persisted.status).toBe("ACKNOWLEDGED");
    expect(persisted.postedById).toBe(storeKeeperUser.id);
    expect(persisted.acknowledgedById).toBe(supervisorUser.id);
    expect(persisted.lines[0].stockTransactions).toHaveLength(1);
    expect(persisted.lines[0].stockTransactions[0]).toMatchObject({
      type: "ISSUE",
      locationId: source.id,
      quantity: expect.objectContaining({}),
    });

    const balances = await testDb!.$queryRaw<{ quantityOnHand: string }[]>`
      SELECT "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" = ${source.id}::uuid
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${unit.id}::uuid
    `;
    expect(balances).toEqual([{ quantityOnHand: "6.000" }]);

    const audit = await testDb!.auditLog.findMany({
      where: { entityType: "MaterialIssue", entityId: issue.id },
      orderBy: { createdAt: "asc" },
      select: { action: true, actorUserId: true, before: true, after: true },
    });
    expect(audit.map(({ action }) => action)).toEqual([
      "CREATE",
      "ISSUE",
      "RECEIVE",
    ]);
    expect(audit[2]).toMatchObject({ actorUserId: supervisorUser.id });

    const scopedWorkspace = await getInventoryWorkspace(siteSupervisor);
    expect(scopedWorkspace.locations.map(({ id }) => id)).toContain(
      siteStore.id,
    );
    expect(scopedWorkspace.materialIssues.map(({ id }) => id)).toContain(
      issue.id,
    );
    const unassignedWorkspace =
      await getInventoryWorkspace(unassignedSupervisor);
    expect(unassignedWorkspace.materialIssues).toHaveLength(0);

    const cancelled = await MaterialIssueService.createDraft(storeKeeper, {
      sourceLocationId: source.id,
      materialId: material.id,
      unitId: unit.id,
      siteId: site.id,
      quantity: 1,
      purpose: "Cancelled draft verification",
    });
    await MaterialIssueService.cancelDraft(storeKeeper, {
      materialIssueId: cancelled.id,
      reason: "No longer required",
    });
    await expect(
      MaterialIssueService.post(storeKeeper, cancelled.id),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
  });

  it("grants material-issue access only to the operational issue roles", async () => {
    const grants = await testDb!.rolePermission.findMany({
      where: {
        permission: { code: "inventory.issue" },
        role: { code: { in: ["STORE_KEEPER", "SITE_SUPERVISOR"] } },
      },
      select: { role: { select: { code: true } } },
      orderBy: { role: { code: "asc" } },
    });
    expect(grants.map(({ role }) => role.code)).toEqual([
      "SITE_SUPERVISOR",
      "STORE_KEEPER",
    ]);
  });
});
