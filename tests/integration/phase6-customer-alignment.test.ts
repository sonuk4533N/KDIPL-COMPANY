import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db/prisma";
import {
  CustomerMovementService as movement,
  customerBalance,
} from "../../src/features/inventory/customer-movement-service";
import { ProjectStockClosureService as closure } from "../../src/features/inventory/project-stock-closure-service";
import { InventoryService } from "../../src/features/inventory/inventory-service";
import { getCustomerMovementWorkspace } from "../../src/features/inventory/customer-movement-queries";
import type { AuthenticatedPrincipal } from "../../src/types/application";
import type {
  MovementCreateInput,
  MovementTransitionInput,
} from "../../src/features/inventory/customer-movement-schemas";

const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && !!process.env.TEST_DATABASE_URL;
const gps = () => ({
  latitude: 28.45,
  longitude: 77.04,
  capturedAt: new Date().toISOString(),
});

async function fixture() {
  const tag = randomUUID().slice(0, 8);
  const actors: Record<string, AuthenticatedPrincipal> = {};
  for (const code of [
    "STORE_KEEPER",
    "SITE_SUPERVISOR",
    "PROJECT_MANAGER",
    "PROJECT_DIRECTOR",
    "MANAGING_DIRECTOR",
    "ACCOUNTS",
    "PURCHASE_MANAGER",
  ]) {
    const role = await db.role.findUniqueOrThrow({ where: { code } });
    const employee = await db.employee.create({
      data: { employeeCode: `P6-${code}-${tag}`, fullName: `${code} ${tag}` },
    });
    const user = await db.user.create({
      data: {
        email: `${code}-${tag}@kdipl.test`,
        emailNormalized: `${code.toLowerCase()}-${tag}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: `${code} ${tag}`,
        employeeId: employee.id,
        roles: { create: { roleId: role.id } },
      },
    });
    actors[code] = {
      userId: user.id,
      employeeId: employee.id,
      email: user.email,
      displayName: user.displayName,
      mustChangePassword: false,
      roleCodes: [code],
      permissions: ["inventory.view", "inventory.receive", "purchase.create"],
    };
  }
  const client = await db.client.findFirstOrThrow();
  const project = await db.project.create({
    data: {
      projectCode: `P6-${tag}`,
      name: `P6 ${tag}`,
      clientId: client.id,
      location: "Test",
      status: "ACTIVE",
    },
  });
  const site = await db.site.create({
    data: {
      siteCode: `S-${tag}`,
      name: `P6 site ${tag}`,
      projectId: project.id,
      location: "Test",
      status: "ACTIVE",
    },
  });
  await db.siteAssignment.create({
    data: {
      siteId: site.id,
      employeeId: actors.SITE_SUPERVISOR.employeeId!,
      role: "SITE_SUPERVISOR",
    },
  });
  await db.projectAssignment.create({
    data: {
      projectId: project.id,
      employeeId: actors.PROJECT_MANAGER.employeeId!,
      role: "PROJECT_MANAGER",
    },
  });
  const material = await db.material.findFirstOrThrow();
  const supplier = await db.supplier.findFirstOrThrow();
  const central = await db.inventoryLocation.create({
    data: {
      locationCode: `P6-C-${tag}`,
      name: `P6 central ${tag}`,
      type: "CENTRAL_STORE",
    },
  });
  const siteStore = await db.inventoryLocation.create({
    data: {
      locationCode: `P6-S-${tag}`,
      name: `P6 site store ${tag}`,
      type: "SITE_STORE",
      projectId: project.id,
      siteId: site.id,
    },
  });
  const evidence = await db.fileRecord.create({
    data: {
      filename: "count-evidence.pdf",
      mimeType: "application/pdf",
      size: BigInt(25),
      storageKey: `test/p6-${tag}.pdf`,
      storageProvider: "LOCAL",
      documentType: "STOCK_MOVEMENT_EVIDENCE",
      scanStatus: "CLEAN",
      scanProvider: "TEST",
      scanReference: "fixture",
      scannedAt: new Date(),
      retentionUntil: new Date("2036-03-31"),
      uploadedById: actors.STORE_KEEPER.userId,
    },
  });
  const actor = actors.PURCHASE_MANAGER.userId;
  const requirement = await db.materialRequirement.create({
    data: {
      requirementNumber: `P6-MR-${tag}`,
      projectId: project.id,
      siteId: site.id,
      neededBy: new Date("2026-10-15"),
      purpose: "Phase 6 fixture",
      createdById: actor,
      lines: {
        create: {
          materialId: material.id,
          unitId: material.defaultUnitId,
          quantity: "100",
        },
      },
    },
    include: { lines: true },
  });
  const rfq = await db.requestForQuotation.create({
    data: {
      rfqNumber: `P6-RFQ-${tag}`,
      requirementId: requirement.id,
      responseDueDate: new Date("2026-10-20"),
      createdById: actor,
    },
  });
  const quotation = await db.supplierQuotation.create({
    data: {
      rfqId: rfq.id,
      supplierId: supplier.id,
      quoteReference: `P6-Q-${tag}`,
      quoteDate: new Date("2026-09-01"),
      validUntil: new Date("2026-10-01"),
      offeredDeliveryDate: new Date("2026-09-20"),
      paymentTerms: "Test",
      subtotal: "10000",
      gstRate: "0",
      gstAmount: "0",
      freightAmount: "0",
      landedTotal: "10000",
      recordedById: actor,
      lines: {
        create: {
          requirementLineId: requirement.lines[0].id,
          unitId: material.defaultUnitId,
          quantity: "100",
          unitPrice: "100",
          lineSubtotal: "10000",
        },
      },
    },
    include: { lines: true },
  });
  const po = await db.purchaseOrder.create({
    data: {
      poNumber: `P6-PO-${tag}`,
      rfqId: rfq.id,
      quotationId: quotation.id,
      supplierId: supplier.id,
      subtotal: "10000",
      gstRate: "0",
      gstAmount: "0",
      freightAmount: "0",
      totalAmount: "10000",
      expectedDeliveryDate: new Date("2026-09-20"),
      paymentTerms: "Test",
      createdById: actor,
      lines: {
        create: {
          quotationLineId: quotation.lines[0].id,
          requirementLineId: requirement.lines[0].id,
          unitId: material.defaultUnitId,
          quantity: "100",
          unitPrice: "100",
          lineSubtotal: "10000",
        },
      },
    },
    include: { lines: true },
  });
  await InventoryService.issuePurchaseOrder(actors.PURCHASE_MANAGER, po.id);
  const grn = await InventoryService.createGoodsReceiptDraft(
    actors.PURCHASE_MANAGER,
    {
      directSiteDelivery: false,
      purchaseOrderId: po.id,
      locationId: central.id,
      supplierDeliveryNote: `P6-DN-${tag}`,
      receivedAt: new Date().toISOString(),
      lines: [
        {
          purchaseOrderLineId: po.lines[0].id,
          acceptedQuantity: 100,
          damagedQuantity: 0,
          rejectedQuantity: 0,
        },
      ],
    },
  );
  await InventoryService.verifyGoodsReceipt(actors.STORE_KEEPER, grn.id);
  await InventoryService.postGoodsReceipt(actors.PROJECT_MANAGER, grn.id);
  const base = {
    sourceLocationId: central.id,
    destinationLocationId: siteStore.id,
    materialId: material.id,
    unitId: material.defaultUnitId,
    quantity: "10",
    reason: "Customer integration test",
    direction: "OUT",
    disposition: "DISPOSAL",
  } satisfies Omit<MovementCreateInput, "kind">;
  const act = (
    who: string,
    id: string,
    command: MovementTransitionInput["command"],
    extra: Partial<MovementTransitionInput> = {},
  ) =>
    movement.transition(actors[who], {
      id,
      command,
      reason: "Verified customer workflow",
      ...extra,
    });
  const balance = (id: string) =>
    db.$transaction((tx) =>
      customerBalance(tx, id, material.id, material.defaultUnitId),
    );
  return {
    tag,
    actors,
    project,
    site,
    central,
    siteStore,
    material,
    evidence,
    base,
    act,
    balance,
  };
}

describe.skipIf(!enabled)("Phase 6 customer-aligned workflows", () => {
  afterAll(async () => db.$disconnect());

  it("enforces supervisor request, PM excess, Store Keeper issue and mandatory acknowledgment", async () => {
    const f = await fixture();
    await expect(
      movement.create(f.actors.STORE_KEEPER, {
        ...f.base,
        kind: "ISSUE",
        ...gps(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const issue = await movement.create(f.actors.SITE_SUPERVISOR, {
      ...f.base,
      kind: "ISSUE",
      ...gps(),
    });
    await expect(
      f.act("STORE_KEEPER", issue.id, "ISSUE", { quantity: "11" }),
    ).rejects.toThrow(/exceeds/);
    await f.act("PROJECT_MANAGER", issue.id, "APPROVE_EXTRA", {
      quantity: "12",
    });
    await f.act("STORE_KEEPER", issue.id, "ISSUE", { quantity: "11" });
    expect((await f.balance(f.central.id)).toString()).toBe("89");
    expect((await f.balance(f.siteStore.id)).toString()).toBe("11");
    await expect(
      f.act("STORE_KEEPER", issue.id, "ACKNOWLEDGE"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.act("SITE_SUPERVISOR", issue.id, "ACKNOWLEDGE");
    await expect(f.act("STORE_KEEPER", issue.id, "ISSUE")).rejects.toThrow();
    expect(
      await db.auditLog.count({ where: { entityId: issue.id } }),
    ).toBeGreaterThanOrEqual(4);
  }, 30_000);

  it("posts only actual transfer receipt, with atomic equal-cost legs and a separate MD variance", async () => {
    const f = await fixture();
    const transfer = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "TRANSFER",
    });
    await expect(
      f.act("STORE_KEEPER", transfer.id, "DISPATCH"),
    ).rejects.toThrow();
    await f.act("PROJECT_DIRECTOR", transfer.id, "APPROVE");
    await f.act("STORE_KEEPER", transfer.id, "DISPATCH");
    expect((await f.balance(f.central.id)).toString()).toBe("100");
    expect(
      await db.customerMovementPosting.count({
        where: { movementId: transfer.id },
      }),
    ).toBe(0);
    await expect(
      f.act("STORE_KEEPER", transfer.id, "RECEIVE", {
        quantity: "8",
        ...gps(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.act("SITE_SUPERVISOR", transfer.id, "RECEIVE", {
        quantity: "8",
        ...gps(),
      }),
    ).rejects.toThrow(/evidence/);
    await f.act("SITE_SUPERVISOR", transfer.id, "RECEIVE", {
      quantity: "8",
      evidenceId: f.evidence.id,
      ...gps(),
    });
    const legs = await db.customerMovementPosting.findMany({
      where: { movementId: transfer.id },
      include: { transaction: true },
    });
    expect(legs).toHaveLength(2);
    expect(
      legs.every(
        (p) =>
          p.unitCost.toString() === "100" &&
          p.transaction.quantity.toString() === "8",
      ),
    ).toBe(true);
    expect((await f.balance(f.central.id)).toString()).toBe("92");
    const variance = await db.customerStockMovement.findUniqueOrThrow({
      where: { varianceOfId: transfer.id },
    });
    expect(variance.quantity.toString()).toBe("2");
    expect(variance.status).toBe("REQUESTED");
    await expect(
      f.act("PROJECT_DIRECTOR", variance.id, "APPROVE"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.act("MANAGING_DIRECTOR", variance.id, "APPROVE");
    await f.act("STORE_KEEPER", variance.id, "POST");
    expect((await f.balance(f.central.id)).toString()).toBe("90");
  }, 30_000);

  it("requires physical return verification and preserves original issue links and quantity limits", async () => {
    const f = await fixture();
    const issue = await movement.create(f.actors.SITE_SUPERVISOR, {
      ...f.base,
      kind: "ISSUE",
      ...gps(),
    });
    await f.act("STORE_KEEPER", issue.id, "ISSUE");
    await f.act("SITE_SUPERVISOR", issue.id, "ACKNOWLEDGE");
    const request = {
      ...f.base,
      kind: "RETURN" as const,
      sourceLocationId: f.siteStore.id,
      destinationLocationId: f.central.id,
      quantity: "4",
      originalIssueId: issue.id,
      ...gps(),
    };
    const returned = await movement.create(f.actors.SITE_SUPERVISOR, request);
    expect((await f.balance(f.central.id)).toString()).toBe("90");
    await expect(
      movement.create(f.actors.SITE_SUPERVISOR, { ...request, quantity: "7" }),
    ).rejects.toThrow(/unreturned/);
    await f.act("STORE_KEEPER", returned.id, "VERIFY_RETURN");
    expect((await f.balance(f.central.id)).toString()).toBe("94");
    expect((await f.balance(f.siteStore.id)).toString()).toBe("6");
    await expect(
      db.customerStockMovement.update({
        where: { id: returned.id },
        data: { quantity: 2 },
      }),
    ).rejects.toThrow(/immutable/i);
  }, 30_000);

  it("reserves dispatches under concurrency and rejects duplicate receipt posting", async () => {
    const f = await fixture();
    const a = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "TRANSFER",
      quantity: "70",
    });
    const b = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "TRANSFER",
      quantity: "70",
    });
    await f.act("PROJECT_DIRECTOR", a.id, "APPROVE");
    await f.act("PROJECT_DIRECTOR", b.id, "APPROVE");
    const dispatches = await Promise.allSettled([
      f.act("STORE_KEEPER", a.id, "DISPATCH"),
      f.act("STORE_KEEPER", b.id, "DISPATCH"),
    ]);
    expect(dispatches.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sent = await db.customerStockMovement.findFirstOrThrow({
      where: { id: { in: [a.id, b.id] }, status: "DISPATCHED" },
    });
    const receipts = await Promise.allSettled([
      f.act("SITE_SUPERVISOR", sent.id, "RECEIVE", {
        quantity: "70",
        ...gps(),
      }),
      f.act("SITE_SUPERVISOR", sent.id, "RECEIVE", {
        quantity: "70",
        ...gps(),
      }),
    ]);
    expect(receipts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await f.balance(f.siteStore.id)).toString()).toBe("70");
  }, 30_000);

  it("permits reasoned SK negative issues and resolves their three-working-day exceptions through returns", async () => {
    const f = await fixture();
    const issue = await movement.create(f.actors.SITE_SUPERVISOR, {
      ...f.base,
      kind: "ISSUE",
      quantity: "105",
      ...gps(),
    });
    await f.act("STORE_KEEPER", issue.id, "ISSUE");
    const exception = await db.temporaryNegativeStockException.findFirstOrThrow(
      { where: { locationId: f.central.id, status: "OPEN" } },
    );
    expect(exception.deficitQuantity.toString()).toBe("5");
    expect([0, 6]).not.toContain(exception.resolutionDueAt.getUTCDay());
    await f.act("SITE_SUPERVISOR", issue.id, "ACKNOWLEDGE");
    const returned = await movement.create(f.actors.SITE_SUPERVISOR, {
      ...f.base,
      kind: "RETURN",
      quantity: "5",
      sourceLocationId: f.siteStore.id,
      destinationLocationId: f.central.id,
      originalIssueId: issue.id,
      ...gps(),
    });
    await f.act("STORE_KEEPER", returned.id, "VERIFY_RETURN");
    expect(
      (
        await db.temporaryNegativeStockException.findUniqueOrThrow({
          where: { id: exception.id },
        })
      ).status,
    ).toBe("RESOLVED");
  }, 30_000);

  it("keeps count variances unposted until Accounts verification and independent MD approval", async () => {
    const f = await fixture();
    const issue = await movement.create(f.actors.SITE_SUPERVISOR, {
      ...f.base,
      kind: "ISSUE",
      ...gps(),
    });
    await f.act("STORE_KEEPER", issue.id, "ISSUE");
    await f.act("SITE_SUPERVISOR", issue.id, "ACKNOWLEDGE");
    const countInput = {
      ...f.base,
      destinationLocationId: undefined,
      sourceLocationId: f.siteStore.id,
      kind: "COUNT" as const,
      quantity: "9",
      evidenceId: f.evidence.id,
    };
    await expect(
      movement.create(f.actors.STORE_KEEPER, countInput),
    ).rejects.toThrow(/closure/);
    await closure.synchronize(
      f.actors.PROJECT_DIRECTOR,
      f.project.id,
      f.central.id,
      "Project closure stock collection",
    );
    const count = await movement.create(f.actors.STORE_KEEPER, countInput);
    expect((await f.balance(f.siteStore.id)).toString()).toBe("10");
    await expect(
      f.act("PROJECT_DIRECTOR", count.id, "VERIFY_COUNT"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.act("ACCOUNTS", count.id, "VERIFY_COUNT");
    const variance = await db.customerStockMovement.findUniqueOrThrow({
      where: { varianceOfId: count.id },
    });
    expect((await f.balance(f.siteStore.id)).toString()).toBe("10");
    await expect(
      closure.close(f.actors.PROJECT_DIRECTOR, f.project.id, "Close project"),
    ).rejects.toThrow();
    await f.act("MANAGING_DIRECTOR", variance.id, "APPROVE");
    await f.act("STORE_KEEPER", variance.id, "POST");
    const oldTransfer = await db.customerStockMovement.findFirstOrThrow({
      where: {
        closureProjectId: f.project.id,
        kind: "TRANSFER",
        status: "REQUESTED",
      },
    });
    await f.act("STORE_KEEPER", oldTransfer.id, "CANCEL");
    await closure.synchronize(
      f.actors.PROJECT_DIRECTOR,
      f.project.id,
      f.central.id,
      "Collect verified remaining stock",
    );
    const transfer = await db.customerStockMovement.findFirstOrThrow({
      where: {
        closureProjectId: f.project.id,
        kind: "TRANSFER",
        status: "REQUESTED",
      },
    });
    expect(transfer.quantity.toString()).toBe("9");
    await f.act("PROJECT_DIRECTOR", transfer.id, "APPROVE");
    await f.act("STORE_KEEPER", transfer.id, "DISPATCH");
    await f.act("STORE_KEEPER", transfer.id, "RECEIVE", { quantity: "9" });
    await closure.close(
      f.actors.PROJECT_DIRECTOR,
      f.project.id,
      "All stock resolved",
    );
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: f.project.id } }))
        .status,
    ).toBe("COMPLETED");
  }, 30_000);

  it("corrects MD-approved adjustments through immutable reversal and replacement", async () => {
    const f = await fixture();
    const adjustment = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "ADJUSTMENT",
      destinationLocationId: undefined,
      quantity: "2",
      evidenceId: f.evidence.id,
    });
    await expect(
      f.act("STORE_KEEPER", adjustment.id, "POST"),
    ).rejects.toThrow();
    await f.act("MANAGING_DIRECTOR", adjustment.id, "APPROVE");
    await f.act("STORE_KEEPER", adjustment.id, "POST");
    const correction = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "ADJUSTMENT",
      destinationLocationId: undefined,
      quantity: "1",
      evidenceId: f.evidence.id,
      correctionOfId: adjustment.id,
    });
    await f.act("MANAGING_DIRECTOR", correction.id, "APPROVE");
    await f.act("STORE_KEEPER", correction.id, "POST");
    expect((await f.balance(f.central.id)).toString()).toBe("99");
    const postings = await db.customerMovementPosting.findMany({
      where: { movementId: correction.id },
    });
    expect(postings).toHaveLength(2);
    await expect(
      db.customerMovementPosting.delete({ where: { id: postings[0].id } }),
    ).rejects.toThrow(/immutable/);
  }, 30_000);

  it("scopes supervisor visibility and rejects missing GPS for site damage", async () => {
    const f = await fixture();
    const transfer = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "TRANSFER",
    });
    const workspace = await getCustomerMovementWorkspace(
      f.actors.SITE_SUPERVISOR,
    );
    expect(workspace.movements.some((m) => m.id === transfer.id)).toBe(true);
    await db.siteAssignment.updateMany({
      where: { siteId: f.site.id },
      data: { isActive: false, endsAt: new Date() },
    });
    expect(
      (await getCustomerMovementWorkspace(f.actors.SITE_SUPERVISOR)).movements,
    ).toHaveLength(0);
    await expect(
      movement.create(f.actors.STORE_KEEPER, {
        ...f.base,
        sourceLocationId: f.siteStore.id,
        destinationLocationId: undefined,
        kind: "NON_USABLE",
        category: "DAMAGE",
        evidenceId: f.evidence.id,
      }),
    ).rejects.toThrow(/GPS/);
    const scrap = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      destinationLocationId: undefined,
      kind: "NON_USABLE",
      category: "SCRAP",
      disposition: "SALE",
      evidenceId: f.evidence.id,
    });
    await expect(
      f.act("PROJECT_DIRECTOR", scrap.id, "APPROVE"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.act("MANAGING_DIRECTOR", scrap.id, "APPROVE");
    await f.act("STORE_KEEPER", scrap.id, "POST");
  }, 30_000);

  it("rejects unapproved raw adjustment writes and approval bypasses", async () => {
    const f = await fixture();
    await expect(
      db.stockTransaction.create({
        data: {
          transactionNumber: `RAW-${f.tag}`,
          type: "ADJUSTMENT_OUT",
          locationId: f.central.id,
          materialId: f.material.id,
          unitId: f.material.defaultUnitId,
          quantity: 1,
          reason: "Unapproved direct ledger write",
          createdById: f.actors.STORE_KEEPER.userId,
        },
      }),
    ).rejects.toThrow(/authorized customer workflow/);
    const adjustment = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "ADJUSTMENT",
      destinationLocationId: undefined,
      evidenceId: f.evidence.id,
    });
    await expect(
      db.customerStockMovement.update({
        where: { id: adjustment.id },
        data: { status: "POSTED", updatedById: f.actors.STORE_KEEPER.userId },
      }),
    ).rejects.toThrow(/transition/);
    const mdRole = await db.role.findUniqueOrThrow({
      where: { code: "MANAGING_DIRECTOR" },
    });
    await db.userRole.create({
      data: { userId: f.actors.STORE_KEEPER.userId, roleId: mdRole.id },
    });
    await expect(
      movement.transition(
        {
          ...f.actors.STORE_KEEPER,
          roleCodes: ["STORE_KEEPER", "MANAGING_DIRECTOR"],
        },
        {
          id: adjustment.id,
          command: "APPROVE",
          reason: "Attempt creator approval",
        },
      ),
    ).rejects.toThrow(/creator cannot/i);
  }, 30_000);

  it("records a total-loss receipt without inventing destination stock", async () => {
    const f = await fixture();
    const transfer = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "TRANSFER",
    });
    await f.act("PROJECT_DIRECTOR", transfer.id, "APPROVE");
    await f.act("STORE_KEEPER", transfer.id, "DISPATCH");
    await f.act("SITE_SUPERVISOR", transfer.id, "RECEIVE", {
      quantity: "0",
      evidenceId: f.evidence.id,
      ...gps(),
    });
    expect(
      await db.customerMovementPosting.count({
        where: { movementId: transfer.id },
      }),
    ).toBe(0);
    expect((await f.balance(f.siteStore.id)).toString()).toBe("0");
    const variance = await db.customerStockMovement.findUniqueOrThrow({
      where: { varianceOfId: transfer.id },
    });
    expect(variance.quantity.toString()).toBe("10");
    await expect(
      f.act("MANAGING_DIRECTOR", variance.id, "REJECT"),
    ).rejects.toThrow(/not discarded/);
  }, 30_000);

  it("freezes stock during physical count and prevents source-only transfer posting", async () => {
    const f = await fixture();
    await closure.synchronize(
      f.actors.PROJECT_DIRECTOR,
      f.project.id,
      f.central.id,
      "Closure count preparation",
    );
    const count = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "COUNT",
      sourceLocationId: f.siteStore.id,
      destinationLocationId: undefined,
      quantity: "0",
      evidenceId: f.evidence.id,
    });
    await expect(
      db.stockTransaction.create({
        data: {
          transactionNumber: `FROZEN-${f.tag}`,
          type: "ISSUE",
          locationId: f.siteStore.id,
          materialId: f.material.id,
          unitId: f.material.defaultUnitId,
          quantity: 1,
          createdById: f.actors.STORE_KEEPER.userId,
          reason: "Attempt mutation during count",
        },
      }),
    ).rejects.toThrow(/freezes/);
    await f.act("ACCOUNTS", count.id, "VERIFY_COUNT");
    expect(
      await db.customerMovementPosting.count({
        where: { movementId: count.id },
      }),
    ).toBe(0);
    const transfer = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      kind: "TRANSFER",
    });
    await f.act("PROJECT_DIRECTOR", transfer.id, "APPROVE");
    await f.act("STORE_KEEPER", transfer.id, "DISPATCH");
    await expect(
      db.customerStockMovement.update({
        where: { id: transfer.id },
        data: {
          status: "RECEIVED",
          actualQuantity: 10,
          updatedById: f.actors.SITE_SUPERVISOR.userId,
          receiptLatitude: 28,
          receiptLongitude: 77,
          receiptGpsCapturedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/atomically/);
  }, 30_000);

  it("blocks project closure for its central-store negative exception even after site stock is cleared", async () => {
    const f = await fixture();
    const issue = await movement.create(f.actors.SITE_SUPERVISOR, {
      ...f.base,
      kind: "ISSUE",
      quantity: "105",
      ...gps(),
    });
    await f.act("STORE_KEEPER", issue.id, "ISSUE");
    await f.act("SITE_SUPERVISOR", issue.id, "ACKNOWLEDGE");
    const adjustment = await movement.create(f.actors.STORE_KEEPER, {
      ...f.base,
      sourceLocationId: f.siteStore.id,
      destinationLocationId: undefined,
      kind: "ADJUSTMENT",
      quantity: "105",
      evidenceId: f.evidence.id,
    });
    await f.act("MANAGING_DIRECTOR", adjustment.id, "APPROVE");
    await f.act("STORE_KEEPER", adjustment.id, "POST");
    await closure.synchronize(
      f.actors.PROJECT_DIRECTOR,
      f.project.id,
      f.central.id,
      "Close after physical verification",
    );
    expect((await f.balance(f.siteStore.id)).toString()).toBe("0");
    await expect(
      closure.close(
        f.actors.PROJECT_DIRECTOR,
        f.project.id,
        "Attempt close with central deficit",
      ),
    ).rejects.toThrow(/negative-stock exceptions/);
  }, 30_000);
});
