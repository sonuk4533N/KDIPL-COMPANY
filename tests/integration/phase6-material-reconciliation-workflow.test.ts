import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { getInventoryWorkspace } from "../../src/features/inventory/inventory-queries";
import { MaterialIssueService } from "../../src/features/inventory/material-issue-service";
import { MaterialReconciliationService } from "../../src/features/inventory/material-reconciliation-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "../../src/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

describe.skipIf(!enabled)("Phase 6 issued-material reconciliation", () => {
  afterAll(async () => testDb?.$disconnect());

  it("reconciles cumulative quantities, restores returns, and closes project material", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const [category, unit, client, assignedEmployee, otherEmployee] =
      await Promise.all([
        testDb!.materialCategory.create({
          data: { code: `P6RC-${tag}`, name: `Reconciliation Category ${tag}` },
        }),
        testDb!.unitOfMeasure.create({
          data: {
            code: `P6RU-${tag}`,
            name: `Reconciliation Unit ${tag}`,
            symbol: "p6r",
          },
        }),
        testDb!.client.create({
          data: {
            clientCode: `P6RCL-${tag}`,
            name: `Reconciliation Client ${tag}`,
          },
        }),
        testDb!.employee.create({
          data: {
            employeeCode: `P6RSS-${tag}`,
            fullName: "Assigned Reconciliation Supervisor",
          },
        }),
        testDb!.employee.create({
          data: {
            employeeCode: `P6ROS-${tag}`,
            fullName: "Other Reconciliation Supervisor",
          },
        }),
      ]);
    const [
      storeUser,
      supervisorUser,
      otherUser,
      adminUser,
      directorUser,
      material,
      project,
    ] = await Promise.all([
      testDb!.user.create({
        data: {
          email: `p6-rec-store-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p6-rec-store-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: "Reconciliation Store Keeper",
        },
      }),
      testDb!.user.create({
        data: {
          email: `p6-rec-supervisor-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p6-rec-supervisor-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: assignedEmployee.fullName,
          employeeId: assignedEmployee.id,
        },
      }),
      testDb!.user.create({
        data: {
          email: `p6-rec-other-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p6-rec-other-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: otherEmployee.fullName,
          employeeId: otherEmployee.id,
        },
      }),
      testDb!.user.create({
        data: {
          email: `p6-rec-admin-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p6-rec-admin-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: "Reconciliation Administrator",
        },
      }),
      testDb!.user.create({
        data: {
          email: `p6-rec-director-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p6-rec-director-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: "Reconciliation Director",
        },
      }),
      testDb!.material.create({
        data: {
          materialCode: `P6RM-${tag}`,
          name: `Reconciliation Material ${tag}`,
          categoryId: category.id,
          defaultUnitId: unit.id,
        },
      }),
      testDb!.project.create({
        data: {
          projectCode: `P6RP-${tag}`,
          name: `Reconciliation Project ${tag}`,
          clientId: client.id,
          location: "Gurugram",
          status: "ACTIVE",
        },
      }),
    ]);
    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: `P6RS-${tag}`,
        name: `Reconciliation Site ${tag}`,
        location: "Gurugram",
        status: "ACTIVE",
      },
    });
    await testDb!.siteAssignment.create({
      data: {
        siteId: site.id,
        employeeId: assignedEmployee.id,
        role: "SITE_SUPERVISOR",
        isActive: true,
      },
    });
    const [source, siteStore] = await Promise.all([
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P6R-SOURCE-${tag}`,
          name: "Reconciliation Source",
          type: "CENTRAL_STORE",
        },
      }),
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P6R-SITE-${tag}`,
          name: "Reconciliation Site Store",
          type: "SITE_STORE",
          projectId: project.id,
          siteId: site.id,
        },
      }),
    ]);
    await testDb!.stockTransaction.create({
      data: {
        transactionNumber: `P6R-OPEN-${tag}`,
        type: "OPENING",
        locationId: source.id,
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
      permissions: ["inventory.view", "inventory.issue", "inventory.reconcile"],
    } satisfies AuthenticatedPrincipal;
    const supervisor = {
      userId: supervisorUser.id,
      displayName: supervisorUser.displayName,
      email: supervisorUser.email,
      employeeId: assignedEmployee.id,
      mustChangePassword: false,
      roleCodes: ["SITE_SUPERVISOR"],
      permissions: ["inventory.view", "inventory.issue", "inventory.reconcile"],
    } satisfies AuthenticatedPrincipal;
    const otherSupervisor = {
      ...supervisor,
      userId: otherUser.id,
      email: otherUser.email,
      employeeId: otherEmployee.id,
    } satisfies AuthenticatedPrincipal;
    const administrator = {
      userId: adminUser.id,
      displayName: adminUser.displayName,
      email: adminUser.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["SYSTEM_ADMINISTRATOR"],
      permissions: ["inventory.view", "inventory.reconcile"],
    } satisfies AuthenticatedPrincipal;
    const director = {
      userId: directorUser.id,
      displayName: directorUser.displayName,
      email: directorUser.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["PROJECT_DIRECTOR"],
      permissions: ["inventory.view", "inventory.reconcile"],
    } satisfies AuthenticatedPrincipal;

    const issue = await MaterialIssueService.createDraft(storeKeeper, {
      sourceLocationId: source.id,
      materialId: material.id,
      unitId: unit.id,
      siteId: site.id,
      quantity: 10,
      purpose: "Phase 6 reconciliation coverage",
    });
    await MaterialIssueService.post(storeKeeper, issue.id);
    await MaterialIssueService.acknowledge(supervisor, issue.id);
    const issueLine = await testDb!.materialIssueLine.findFirstOrThrow({
      where: { materialIssueId: issue.id },
    });

    const routineInput = {
      materialIssueLineId: issueLine.id,
      returnLocationId: siteStore.id,
      purpose: "ROUTINE" as const,
      consumedQuantity: 4,
      returnedQuantity: 2,
      wastageQuantity: 1,
      scrapQuantity: 1,
      notes: "Witnessed partial reconciliation and return handover",
    };
    await expect(
      MaterialReconciliationService.createDraft(administrator, routineInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      MaterialReconciliationService.createDraft(otherSupervisor, routineInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      MaterialReconciliationService.createDraft(director, routineInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      MaterialReconciliationService.createDraft(supervisor, {
        ...routineInput,
        returnLocationId: source.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const routine = await MaterialReconciliationService.createDraft(
      supervisor,
      routineInput,
    );
    await MaterialReconciliationService.post(supervisor, routine.id);
    await expect(
      MaterialReconciliationService.post(supervisor, routine.id),
    ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });
    await expect(
      MaterialReconciliationService.createDraft(supervisor, {
        ...routineInput,
        returnLocationId: undefined,
        consumedQuantity: 3,
        returnedQuantity: 0,
        wastageQuantity: 0,
        scrapQuantity: 0,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      MaterialReconciliationService.createDraft(supervisor, {
        ...routineInput,
        returnLocationId: undefined,
        purpose: "PROJECT_CLOSE",
        consumedQuantity: 1,
        returnedQuantity: 0,
        wastageQuantity: 0,
        scrapQuantity: 0,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const final = await MaterialReconciliationService.createDraft(storeKeeper, {
      materialIssueLineId: issueLine.id,
      purpose: "PROJECT_CLOSE",
      consumedQuantity: 1,
      returnedQuantity: 0,
      wastageQuantity: 0,
      scrapQuantity: 1,
      notes: "Final project-close consumption and scrap disposition",
    });
    await MaterialReconciliationService.post(storeKeeper, final.id);
    await expect(
      MaterialReconciliationService.createDraft(storeKeeper, {
        materialIssueLineId: issueLine.id,
        purpose: "ROUTINE",
        consumedQuantity: 0.001,
        returnedQuantity: 0,
        wastageQuantity: 0,
        scrapQuantity: 0,
        notes: "Must be rejected after final close",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const secondIssue = await MaterialIssueService.createDraft(storeKeeper, {
      sourceLocationId: siteStore.id,
      materialId: material.id,
      unitId: unit.id,
      siteId: site.id,
      quantity: 1,
      purpose: "Cancellation coverage",
    });
    await MaterialIssueService.post(storeKeeper, secondIssue.id);
    await MaterialIssueService.acknowledge(supervisor, secondIssue.id);
    const secondLine = await testDb!.materialIssueLine.findFirstOrThrow({
      where: { materialIssueId: secondIssue.id },
    });
    const cancelled = await MaterialReconciliationService.createDraft(
      supervisor,
      {
        materialIssueLineId: secondLine.id,
        purpose: "ROUTINE",
        consumedQuantity: 1,
        returnedQuantity: 0,
        wastageQuantity: 0,
        scrapQuantity: 0,
        notes: "Draft cancellation evidence",
      },
    );
    await MaterialReconciliationService.cancelDraft(supervisor, {
      materialReconciliationId: cancelled.id,
      reason: "Count evidence requires correction",
    });
    await expect(
      MaterialReconciliationService.post(supervisor, cancelled.id),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });

    const [
      balance,
      returnedTransaction,
      finalRecord,
      audits,
      directorWorkspace,
      supervisorWorkspace,
      otherWorkspace,
    ] = await Promise.all([
      testDb!.$queryRaw<
        Array<{ quantityOnHand: string }>
      >`SELECT "quantityOnHand"::text AS "quantityOnHand" FROM "InventoryStockBalance" WHERE "locationId" = ${siteStore.id}::uuid AND "materialId" = ${material.id}::uuid AND "unitId" = ${unit.id}::uuid`,
      testDb!.stockTransaction.findUnique({
        where: { reconciliationId: routine.id },
      }),
      testDb!.materialReconciliation.findUniqueOrThrow({
        where: { id: final.id },
      }),
      testDb!.auditLog.findMany({
        where: { entityType: "MaterialReconciliation", entityId: routine.id },
        orderBy: { createdAt: "asc" },
      }),
      getInventoryWorkspace(director),
      getInventoryWorkspace(supervisor),
      getInventoryWorkspace(otherSupervisor),
    ]);
    expect(balance).toEqual([{ quantityOnHand: "1.000" }]);
    expect(returnedTransaction?.type).toBe("RETURN");
    expect(returnedTransaction?.quantity.toString()).toBe("2");
    expect(finalRecord).toMatchObject({
      status: "POSTED",
      purpose: "PROJECT_CLOSE",
    });
    expect(audits.map(({ action }) => action)).toEqual(["CREATE", "UPDATE"]);
    expect(
      directorWorkspace.materialReconciliations.map(({ id }) => id),
    ).toContain(routine.id);
    expect(
      supervisorWorkspace.materialReconciliations.map(({ id }) => id),
    ).toContain(routine.id);
    expect(otherWorkspace.materialReconciliations).toHaveLength(0);
  });

  it("grants reconciliation visibility to the operational and oversight roles", async () => {
    const grants = await testDb!.rolePermission.findMany({
      where: {
        permission: { code: "inventory.reconcile" },
        role: {
          code: { in: ["STORE_KEEPER", "SITE_SUPERVISOR", "PROJECT_DIRECTOR"] },
        },
      },
      include: { role: true },
    });
    expect(grants.map(({ role }) => role.code).sort()).toEqual([
      "PROJECT_DIRECTOR",
      "SITE_SUPERVISOR",
      "STORE_KEEPER",
    ]);
  });
});
