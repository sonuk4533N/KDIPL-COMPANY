import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { InventoryCompletionService } from "../../src/features/inventory/inventory-completion-service";
import { getInventoryWorkspace } from "../../src/features/inventory/inventory-queries";
import { InventoryService } from "../../src/features/inventory/inventory-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "../../src/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

describe.skipIf(!enabled)("Phase 5 receiving workflow", () => {
  afterAll(async () => testDb?.$disconnect());

  it("receives from an issued PO through separated verification and approval", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const [project, site, material, supplier, actor] = await Promise.all([
      testDb!.project.findUniqueOrThrow({
        where: { projectCode: "PRJ-DLF-001" },
      }),
      testDb!.site.findFirstOrThrow({
        where: { project: { projectCode: "PRJ-DLF-001" } },
      }),
      testDb!.material.findFirstOrThrow({
        where: { materialCode: "MAT-PVC-25MM" },
      }),
      testDb!.supplier.findFirstOrThrow(),
      testDb!.user.findFirstOrThrow(),
    ]);
    const purchaseManager = {
      userId: actor.id,
      displayName: actor.displayName,
      email: actor.email,
      employeeId: actor.employeeId,
      mustChangePassword: false,
      roleCodes: ["PURCHASE_MANAGER"],
      permissions: ["purchase.create"],
    } satisfies AuthenticatedPrincipal;
    const approverEmployee = await testDb!.employee.create({
      data: {
        employeeCode: `P5-PM-${tag}`,
        fullName: `P5 Project Manager ${tag}`,
      },
    });
    await testDb!.projectAssignment.create({
      data: {
        projectId: project.id,
        employeeId: approverEmployee.id,
        role: "PROJECT_MANAGER",
        isPrimary: false,
      },
    });
    const [verifierUser, approverUser] = await Promise.all([
      testDb!.user.create({
        data: {
          email: `p5-verifier-${tag}@kdipl.test`,
          emailNormalized: `p5-verifier-${tag}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: `P5 Store Keeper ${tag}`,
        },
      }),
      testDb!.user.create({
        data: {
          email: `p5-approver-${tag}@kdipl.test`,
          emailNormalized: `p5-approver-${tag}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: `P5 Project Manager ${tag}`,
          employeeId: approverEmployee.id,
        },
      }),
    ]);
    const storeKeeper = {
      userId: verifierUser.id,
      displayName: verifierUser.displayName,
      email: verifierUser.email,
      employeeId: verifierUser.employeeId,
      mustChangePassword: false,
      roleCodes: ["STORE_KEEPER"],
      permissions: ["inventory.view", "inventory.receive"],
    } satisfies AuthenticatedPrincipal;
    const projectManager = {
      userId: approverUser.id,
      displayName: approverUser.displayName,
      email: approverUser.email,
      employeeId: approverUser.employeeId,
      mustChangePassword: false,
      roleCodes: ["PROJECT_MANAGER"],
      permissions: ["inventory.view", "inventory.receive"],
    } satisfies AuthenticatedPrincipal;

    const requirement = await testDb!.materialRequirement.create({
      data: {
        requirementNumber: `P5-MR-${tag}`,
        projectId: project.id,
        siteId: site.id,
        neededBy: new Date("2026-10-15T00:00:00.000Z"),
        purpose: "Phase 5 receiving integration fixture",
        createdById: actor.id,
        lines: {
          create: {
            materialId: material.id,
            unitId: material.defaultUnitId,
            quantity: "10.000",
          },
        },
      },
      include: { lines: true },
    });
    const rfq = await testDb!.requestForQuotation.create({
      data: {
        rfqNumber: `P5-RFQ-${tag}`,
        requirementId: requirement.id,
        responseDueDate: new Date("2026-10-20T00:00:00.000Z"),
        createdById: actor.id,
      },
    });
    const quotation = await testDb!.supplierQuotation.create({
      data: {
        rfqId: rfq.id,
        supplierId: supplier.id,
        quoteReference: `P5-Q-${tag}`,
        quoteDate: new Date("2026-09-01T00:00:00.000Z"),
        validUntil: new Date("2026-10-01T00:00:00.000Z"),
        offeredDeliveryDate: new Date("2026-09-20T00:00:00.000Z"),
        paymentTerms: "Integration test terms",
        subtotal: "1000.00",
        gstRate: "18.00",
        gstAmount: "180.00",
        freightAmount: "0.00",
        landedTotal: "1180.00",
        recordedById: actor.id,
        lines: {
          create: {
            requirementLineId: requirement.lines[0].id,
            unitId: material.defaultUnitId,
            quantity: "10.000",
            unitPrice: "100.00",
            lineSubtotal: "1000.00",
          },
        },
      },
      include: { lines: true },
    });
    const purchaseOrder = await testDb!.purchaseOrder.create({
      data: {
        poNumber: `P5-PO-${tag}`,
        rfqId: rfq.id,
        quotationId: quotation.id,
        supplierId: supplier.id,
        subtotal: "1000.00",
        gstRate: "18.00",
        gstAmount: "180.00",
        freightAmount: "0.00",
        totalAmount: "1180.00",
        expectedDeliveryDate: new Date("2026-09-20T00:00:00.000Z"),
        paymentTerms: "Integration test terms",
        createdById: actor.id,
        lines: {
          create: {
            quotationLineId: quotation.lines[0].id,
            requirementLineId: requirement.lines[0].id,
            unitId: material.defaultUnitId,
            quantity: "10.000",
            unitPrice: "100.00",
            lineSubtotal: "1000.00",
          },
        },
      },
      include: { lines: true },
    });
    const location = await testDb!.inventoryLocation.create({
      data: {
        locationCode: `P5-WH-${tag}`,
        name: `Phase 5 warehouse ${tag}`,
        type: "CENTRAL_STORE",
      },
    });

    await InventoryService.issuePurchaseOrder(
      purchaseManager,
      purchaseOrder.id,
    );

    const first = await InventoryService.createGoodsReceiptDraft(
      purchaseManager,
      {
        directSiteDelivery: false,
        purchaseOrderId: purchaseOrder.id,
        locationId: location.id,
        supplierDeliveryNote: `DN-${tag}-1`,
        receivedAt: "2026-09-03T09:00:00.000Z",
        lines: [
          {
            purchaseOrderLineId: purchaseOrder.lines[0].id,
            acceptedQuantity: 6,
            damagedQuantity: 1,
            rejectedQuantity: 1,
            notes: "Two non-conforming units",
          },
        ],
      },
    );
    await InventoryService.verifyGoodsReceipt(storeKeeper, first.id);
    await InventoryService.postGoodsReceipt(projectManager, first.id);

    expect(
      await testDb!.purchaseOrder.findUniqueOrThrow({
        where: { id: purchaseOrder.id },
        select: { status: true },
      }),
    ).toEqual({ status: "PARTIALLY_RECEIVED" });
    const exceptions = await testDb!.goodsReceiptException.findMany({
      where: { goodsReceiptLine: { goodsReceiptId: first.id } },
    });
    expect(exceptions.map(({ type }) => type).sort()).toEqual([
      "DAMAGED",
      "REJECTED",
    ]);
    await expect(
      InventoryCompletionService.closePurchaseOrder(
        purchaseManager,
        purchaseOrder.id,
        "Supplier will not deliver the remaining quantity",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    for (const exception of exceptions) {
      await InventoryCompletionService.updateGoodsReceiptException(
        storeKeeper,
        {
          exceptionId: exception.id,
          status: "RESOLVED",
          evidenceReference: `EVIDENCE-${tag}-${exception.type}`,
        },
      );
    }

    const finalA = await InventoryService.createGoodsReceiptDraft(
      purchaseManager,
      {
        directSiteDelivery: false,
        purchaseOrderId: purchaseOrder.id,
        locationId: location.id,
        receivedAt: "2026-09-04T09:00:00.000Z",
        lines: [
          {
            purchaseOrderLineId: purchaseOrder.lines[0].id,
            acceptedQuantity: 3,
            damagedQuantity: 0,
            rejectedQuantity: 0,
          },
        ],
      },
    );
    const finalALine = await testDb!.goodsReceiptLine.findFirstOrThrow({
      where: { goodsReceiptId: finalA.id },
    });
    await InventoryCompletionService.updateGoodsReceiptDraft(purchaseManager, {
      directSiteDelivery: false,
      goodsReceiptId: finalA.id,
      locationId: location.id,
      receivedAt: "2026-09-04T09:30:00.000Z",
      lines: [
        {
          goodsReceiptLineId: finalALine.id,
          acceptedQuantity: 4,
          damagedQuantity: 0,
          rejectedQuantity: 0,
        },
      ],
    });
    const finalB = await InventoryService.createGoodsReceiptDraft(
      purchaseManager,
      {
        directSiteDelivery: false,
        purchaseOrderId: purchaseOrder.id,
        locationId: location.id,
        receivedAt: "2026-09-04T10:00:00.000Z",
        lines: [
          {
            purchaseOrderLineId: purchaseOrder.lines[0].id,
            acceptedQuantity: 4,
            damagedQuantity: 0,
            rejectedQuantity: 0,
          },
        ],
      },
    );

    await Promise.all([
      InventoryService.verifyGoodsReceipt(storeKeeper, finalA.id),
      InventoryService.verifyGoodsReceipt(storeKeeper, finalB.id),
    ]);
    const concurrentPosts = await Promise.allSettled([
      InventoryService.postGoodsReceipt(projectManager, finalA.id),
      InventoryService.postGoodsReceipt(projectManager, finalB.id),
    ]);
    expect(
      concurrentPosts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      concurrentPosts.filter(({ status }) => status === "rejected"),
    ).toHaveLength(1);

    const receipts = await testDb!.goodsReceipt.findMany({
      where: { id: { in: [finalA.id, finalB.id] } },
      select: { id: true, status: true },
    });
    const unposted = receipts.find(
      ({ status }) => status === "PENDING_PM_APPROVAL",
    );
    expect(unposted).toBeDefined();
    await InventoryCompletionService.cancelGoodsReceiptDraft(
      purchaseManager,
      unposted!.id,
      "Concurrent duplicate final receipt",
    );
    await InventoryCompletionService.closePurchaseOrder(
      purchaseManager,
      purchaseOrder.id,
    );

    const [closedPo, balance, stockEntries, audits] = await Promise.all([
      testDb!.purchaseOrder.findUniqueOrThrow({
        where: { id: purchaseOrder.id },
        select: { status: true, closedById: true, closedAt: true },
      }),
      testDb!.$queryRaw<Array<{ quantityOnHand: string }>>`
        SELECT "quantityOnHand"::text AS "quantityOnHand"
        FROM "InventoryStockBalance"
        WHERE "locationId" = ${location.id}::uuid
          AND "materialId" = ${material.id}::uuid
      `,
      testDb!.stockTransaction.findMany({
        where: {
          goodsReceiptLine: {
            goodsReceipt: { purchaseOrderId: purchaseOrder.id },
          },
        },
      }),
      testDb!.auditLog.findMany({
        where: {
          entityId: { in: [purchaseOrder.id, first.id, finalA.id, finalB.id] },
        },
      }),
    ]);
    expect(closedPo).toMatchObject({
      status: "CLOSED",
      closedById: actor.id,
    });
    expect(closedPo.closedAt).not.toBeNull();
    expect(balance).toEqual([{ quantityOnHand: "10.000" }]);
    expect(stockEntries).toHaveLength(2);
    expect(audits.length).toBeGreaterThanOrEqual(8);

    const posted = receipts.find(({ status }) => status === "POSTED")!;
    await expect(
      testDb!.goodsReceipt.update({
        where: { id: posted.id },
        data: { notes: "forbidden mutation" },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it("limits Site Supervisor inventory visibility to actively assigned site stores", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const employee = await testDb!.employee.findUniqueOrThrow({
      where: { employeeCode: "DEMO-SS-001" },
      include: {
        siteAssignments: {
          where: { role: "SITE_SUPERVISOR", isActive: true },
          take: 1,
          include: { site: true },
        },
      },
    });
    const assignment = employee.siteAssignments[0];
    expect(assignment).toBeDefined();
    const user = await testDb!.user.upsert({
      where: { employeeId: employee.id },
      update: { status: "ACTIVE" },
      create: {
        email: "phase5-supervisor@kdipl.test",
        emailNormalized: "phase5-supervisor@kdipl.test",
        passwordHash: "integration-test",
        displayName: employee.fullName,
        employeeId: employee.id,
      },
    });
    const [siteStore, centralStore] = await Promise.all([
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P5-SCOPE-SITE-${tag}`,
          name: `Assigned site store ${tag}`,
          type: "SITE_STORE",
          projectId: assignment.site.projectId,
          siteId: assignment.siteId,
        },
      }),
      testDb!.inventoryLocation.create({
        data: {
          locationCode: `P5-SCOPE-CENTRAL-${tag}`,
          name: `Unscoped central store ${tag}`,
          type: "CENTRAL_STORE",
        },
      }),
    ]);
    const principal = {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      employeeId: employee.id,
      mustChangePassword: false,
      roleCodes: ["SITE_SUPERVISOR"],
      permissions: ["inventory.view", "inventory.receive"],
    } satisfies AuthenticatedPrincipal;

    const workspace = await getInventoryWorkspace(principal);
    expect(workspace.locations.map(({ id }) => id)).toContain(siteStore.id);
    expect(workspace.locations.map(({ id }) => id)).not.toContain(
      centralStore.id,
    );
    expect(workspace.locations.every(({ type }) => type === "SITE_STORE")).toBe(
      true,
    );
    expect(
      workspace.goodsReceipts.every(({ locationId }) =>
        workspace.locations.some(({ id }) => id === locationId),
      ),
    ).toBe(true);
  });
});
