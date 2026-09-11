import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { getInventoryWorkspace } from "../../src/features/inventory/inventory-queries";
import { StockAdjustmentService } from "../../src/features/inventory/stock-adjustment-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "../../src/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

describe.skipIf(!enabled)(
  "Phase 6 controlled stock adjustment workflow",
  () => {
    afterAll(async () => testDb?.$disconnect());

    it("requires an independent decision and posts approved directions atomically", async () => {
      const tag = randomUUID().slice(0, 8).toUpperCase();
      const [category, unit, storeUser, directorUser, administratorUser] =
        await Promise.all([
          testDb!.materialCategory.create({
            data: { code: `P6AC-${tag}`, name: `Adjustment Category ${tag}` },
          }),
          testDb!.unitOfMeasure.create({
            data: {
              code: `P6AU-${tag}`,
              name: `Adjustment Unit ${tag}`,
              symbol: "p6a",
            },
          }),
          testDb!.user.create({
            data: {
              email: `p6-adjust-store-${tag.toLowerCase()}@kdipl.test`,
              emailNormalized: `p6-adjust-store-${tag.toLowerCase()}@kdipl.test`,
              passwordHash: "integration-test",
              displayName: "Adjustment Store Keeper",
            },
          }),
          testDb!.user.create({
            data: {
              email: `p6-adjust-director-${tag.toLowerCase()}@kdipl.test`,
              emailNormalized: `p6-adjust-director-${tag.toLowerCase()}@kdipl.test`,
              passwordHash: "integration-test",
              displayName: "Adjustment Project Director",
            },
          }),
          testDb!.user.create({
            data: {
              email: `p6-adjust-admin-${tag.toLowerCase()}@kdipl.test`,
              emailNormalized: `p6-adjust-admin-${tag.toLowerCase()}@kdipl.test`,
              passwordHash: "integration-test",
              displayName: "Adjustment Administrator",
            },
          }),
        ]);
      const material = await testDb!.material.create({
        data: {
          materialCode: `P6AM-${tag}`,
          name: `Adjustment Material ${tag}`,
          categoryId: category.id,
          defaultUnitId: unit.id,
        },
      });
      const location = await testDb!.inventoryLocation.create({
        data: {
          locationCode: `P6A-LOC-${tag}`,
          name: `Adjustment Location ${tag}`,
          type: "CENTRAL_STORE",
        },
      });
      await testDb!.stockTransaction.create({
        data: {
          transactionNumber: `P6A-OPEN-${tag}`,
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
        permissions: ["inventory.view", "inventory.adjust"],
      } satisfies AuthenticatedPrincipal;
      const projectDirector = {
        userId: directorUser.id,
        displayName: directorUser.displayName,
        email: directorUser.email,
        employeeId: null,
        mustChangePassword: false,
        roleCodes: ["PROJECT_DIRECTOR"],
        permissions: ["inventory.view", "inventory.adjust"],
      } satisfies AuthenticatedPrincipal;
      const administrator = {
        userId: administratorUser.id,
        displayName: administratorUser.displayName,
        email: administratorUser.email,
        employeeId: null,
        mustChangePassword: false,
        roleCodes: ["SYSTEM_ADMINISTRATOR"],
        permissions: ["inventory.view", "inventory.adjust"],
      } satisfies AuthenticatedPrincipal;

      await expect(
        StockAdjustmentService.createDraft(administrator, {
          locationId: location.id,
          materialId: material.id,
          unitId: unit.id,
          direction: "OUT",
          quantity: 4,
          reason: "Administrator must remain read only",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const outbound = await StockAdjustmentService.createDraft(storeKeeper, {
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        direction: "OUT",
        quantity: 4,
        reason: "Verified damaged quantity removed from usable stock",
      });
      await StockAdjustmentService.submit(storeKeeper, outbound.id);
      await expect(
        StockAdjustmentService.post(storeKeeper, outbound.id),
      ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
      await expect(
        StockAdjustmentService.decide(storeKeeper, {
          stockAdjustmentId: outbound.id,
          decision: "APPROVE",
          notes: "Store Keeper cannot decide",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        StockAdjustmentService.decide(administrator, {
          stockAdjustmentId: outbound.id,
          decision: "APPROVE",
          notes: "Administrator cannot decide",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await StockAdjustmentService.decide(projectDirector, {
        stockAdjustmentId: outbound.id,
        decision: "APPROVE",
        notes: "Inspection evidence reviewed and approved",
      });
      await StockAdjustmentService.post(storeKeeper, outbound.id);
      await expect(
        StockAdjustmentService.post(storeKeeper, outbound.id),
      ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });

      const inbound = await StockAdjustmentService.createDraft(storeKeeper, {
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        direction: "IN",
        quantity: 2,
        reason: "Verified unrecorded stock found in controlled storage",
      });
      await StockAdjustmentService.submit(storeKeeper, inbound.id);
      await StockAdjustmentService.decide(projectDirector, {
        stockAdjustmentId: inbound.id,
        decision: "APPROVE",
        notes: "Physical evidence supports the increase",
      });
      await StockAdjustmentService.post(storeKeeper, inbound.id);

      const excessive = await StockAdjustmentService.createDraft(storeKeeper, {
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        direction: "OUT",
        quantity: 20,
        reason: "Deliberately exceeds balance for rollback coverage",
      });
      await StockAdjustmentService.submit(storeKeeper, excessive.id);
      await expect(
        testDb!.stockAdjustment.update({
          where: { id: excessive.id },
          data: {
            status: "APPROVED",
            decidedById: directorUser.id,
            decidedAt: new Date(),
            decisionNotes: null,
          },
        }),
      ).rejects.toThrow(/decision_notes/i);
      await StockAdjustmentService.decide(projectDirector, {
        stockAdjustmentId: excessive.id,
        decision: "APPROVE",
        notes: "Approval alone must not bypass stock controls",
      });
      await expect(
        StockAdjustmentService.post(storeKeeper, excessive.id),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      expect(
        await testDb!.stockAdjustment.findUniqueOrThrow({
          where: { id: excessive.id },
          select: { status: true, stockTransaction: true },
        }),
      ).toEqual({ status: "APPROVED", stockTransaction: null });

      const rejected = await StockAdjustmentService.createDraft(storeKeeper, {
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        direction: "IN",
        quantity: 1,
        reason: "Unsupported count correction",
      });
      await StockAdjustmentService.submit(storeKeeper, rejected.id);
      await StockAdjustmentService.decide(projectDirector, {
        stockAdjustmentId: rejected.id,
        decision: "REJECT",
        notes: "Supporting evidence is insufficient",
      });
      await expect(
        StockAdjustmentService.post(storeKeeper, rejected.id),
      ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });

      const cancelled = await StockAdjustmentService.createDraft(storeKeeper, {
        locationId: location.id,
        materialId: material.id,
        unitId: unit.id,
        direction: "IN",
        quantity: 1,
        reason: "Correction draft created in error",
      });
      await StockAdjustmentService.cancel(storeKeeper, {
        stockAdjustmentId: cancelled.id,
        reason: "Duplicate evidence record",
      });

      const selfApproval = await StockAdjustmentService.createDraft(
        {
          ...storeKeeper,
          roleCodes: ["STORE_KEEPER", "PROJECT_DIRECTOR"],
        },
        {
          locationId: location.id,
          materialId: material.id,
          unitId: unit.id,
          direction: "IN",
          quantity: 1,
          reason: "Separation of duties verification",
        },
      );
      await StockAdjustmentService.submit(
        {
          ...storeKeeper,
          roleCodes: ["STORE_KEEPER", "PROJECT_DIRECTOR"],
        },
        selfApproval.id,
      );
      await expect(
        StockAdjustmentService.decide(
          {
            ...storeKeeper,
            roleCodes: ["STORE_KEEPER", "PROJECT_DIRECTOR"],
          },
          {
            stockAdjustmentId: selfApproval.id,
            decision: "APPROVE",
            notes: "Must be rejected as self approval",
          },
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        testDb!.stockAdjustment.update({
          where: { id: selfApproval.id },
          data: {
            status: "APPROVED",
            decidedById: storeUser.id,
            decidedAt: new Date(),
            decisionNotes: "Direct database self approval must also fail",
          },
        }),
      ).rejects.toThrow(/decision_separation/i);

      const [balance, transactions, audits, directorWorkspace] =
        await Promise.all([
          testDb!.$queryRaw<Array<{ quantityOnHand: string }>>`
          SELECT "quantityOnHand"::text AS "quantityOnHand"
          FROM "InventoryStockBalance"
          WHERE "locationId" = ${location.id}::uuid
            AND "materialId" = ${material.id}::uuid
            AND "unitId" = ${unit.id}::uuid
        `,
          testDb!.stockTransaction.findMany({
            where: { stockAdjustmentId: { in: [outbound.id, inbound.id] } },
          }),
          testDb!.auditLog.findMany({
            where: { entityType: "StockAdjustment", entityId: outbound.id },
            orderBy: { createdAt: "asc" },
          }),
          getInventoryWorkspace(projectDirector),
        ]);
      expect(balance).toEqual([{ quantityOnHand: "8.000" }]);
      expect(transactions.map(({ type }) => type).sort()).toEqual([
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
      ]);
      expect(audits.map(({ action }) => action)).toEqual([
        "CREATE",
        "SUBMIT",
        "APPROVE",
        "ADJUST",
      ]);
      expect(directorWorkspace.stockAdjustments.map(({ id }) => id)).toContain(
        outbound.id,
      );
    });

    it("grants adjustment duties to Store Keepers and Project Directors", async () => {
      const grants = await testDb!.rolePermission.findMany({
        where: {
          role: { code: { in: ["STORE_KEEPER", "PROJECT_DIRECTOR"] } },
          permission: { code: "inventory.adjust" },
        },
        include: { role: true },
      });
      expect(grants.map(({ role }) => role.code).sort()).toEqual([
        "PROJECT_DIRECTOR",
        "STORE_KEEPER",
      ]);
    });
  },
);
