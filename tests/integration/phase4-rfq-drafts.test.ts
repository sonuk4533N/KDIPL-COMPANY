import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { RfqService } from "@/features/procurement/rfq-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "@/types/application";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && Boolean(testDatabaseUrl);
const testDb =
  enabled && testDatabaseUrl
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
      })
    : null;

const created = {
  rfqIds: [] as string[],
  requirementIds: [] as string[],
  supplierIds: [] as string[],
  materialIds: [] as string[],
  categoryIds: [] as string[],
  unitIds: [] as string[],
  siteIds: [] as string[],
  projectIds: [] as string[],
  clientIds: [] as string[],
  userIds: [] as string[],
};

describe.skipIf(!enabled)("Phase 4 RFQ workflow", () => {
  // These tests use unique identifiers and intentionally retain commercial
  // documents. Finalized file records cannot be deleted under the production
  // retention policy, so the ephemeral test database owns cleanup.

  afterAll(async () => testDb?.$disconnect());

  it("creates a numbered, audited RFQ draft from trusted approved demand", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const client = await testDb!.client.create({
      data: { clientCode: `P4C-${tag}`, name: `Phase 4 Client ${tag}` },
    });
    created.clientIds.push(client.id);
    const project = await testDb!.project.create({
      data: {
        projectCode: `P4P-${tag}`,
        name: `Phase 4 Project ${tag}`,
        clientId: client.id,
        location: "Noida",
        status: "ACTIVE",
      },
    });
    created.projectIds.push(project.id);
    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: "P4-SITE",
        name: "Phase 4 Site",
        location: "Noida",
        status: "ACTIVE",
      },
    });
    created.siteIds.push(site.id);
    const category = await testDb!.materialCategory.create({
      data: { code: `P4CAT-${tag}`, name: `Phase 4 Category ${tag}` },
    });
    created.categoryIds.push(category.id);
    const unit = await testDb!.unitOfMeasure.create({
      data: { code: `P4U-${tag}`, name: `Phase 4 Unit ${tag}`, symbol: "p4" },
    });
    created.unitIds.push(unit.id);
    const material = await testDb!.material.create({
      data: {
        materialCode: `P4M-${tag}`,
        name: `Phase 4 Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
      },
    });
    created.materialIds.push(material.id);
    const supplier = await testDb!.supplier.create({
      data: {
        supplierCode: `P4S-${tag}`,
        legalName: `Phase 4 Supplier ${tag}`,
        city: "Delhi",
        state: "Delhi",
      },
    });
    created.supplierIds.push(supplier.id);
    const user = await testDb!.user.create({
      data: {
        email: `p4-${tag.toLowerCase()}@kdipl.test`,
        emailNormalized: `p4-${tag.toLowerCase()}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: "Phase 4 Creator",
      },
    });
    created.userIds.push(user.id);
    const now = new Date();
    const requirement = await testDb!.materialRequirement.create({
      data: {
        requirementNumber: `P4-MR-${tag}`,
        projectId: project.id,
        siteId: site.id,
        status: "APPROVED",
        neededBy: new Date(`${now.getUTCFullYear() + 1}-11-01T00:00:00.000Z`),
        purpose: "Approved demand for RFQ integration",
        createdById: user.id,
        submittedById: user.id,
        submittedByRole: "PROJECT_MANAGER",
        submittedAt: now,
        decidedById: user.id,
        decidedAt: now,
        lines: {
          create: {
            materialId: material.id,
            unitId: unit.id,
            quantity: "8.500",
          },
        },
      },
    });
    created.requirementIds.push(requirement.id);
    const principal: AuthenticatedPrincipal = {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["SYSTEM_ADMINISTRATOR"],
      permissions: ["app.access", "purchase.view", "purchase.create"],
    };

    const result = await RfqService.saveDraft(principal, {
      requirementId: requirement.id,
      responseDueDate: `${now.getUTCFullYear() + 1}-10-01`,
      supplierIds: [supplier.id],
      notes: "Draft only; no supplier communication.",
    });
    created.rfqIds.push(result.id);

    const rfq = await testDb!.requestForQuotation.findUniqueOrThrow({
      where: { id: result.id },
      include: { invitedSuppliers: true },
    });
    expect(rfq.rfqNumber).toMatch(/^RFQ-\d{4}-\d{4}$/);
    expect(rfq.status).toBe("DRAFT");
    expect(rfq.requirementId).toBe(requirement.id);
    expect(rfq.invitedSuppliers).toMatchObject([
      { supplierId: supplier.id, isActive: true },
    ]);
    expect(
      await testDb!.auditLog.count({
        where: { entityType: "RequestForQuotation", entityId: rfq.id },
      }),
    ).toBe(1);
  });

  it("issues to three suppliers, calculates a quotation, approves independently, and creates a draft PO", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const client = await testDb!.client.create({
      data: { clientCode: `P4FC-${tag}`, name: `Commercial Client ${tag}` },
    });
    created.clientIds.push(client.id);
    const project = await testDb!.project.create({
      data: {
        projectCode: `P4FP-${tag}`,
        name: `Commercial Project ${tag}`,
        clientId: client.id,
        location: "Gurugram",
        status: "ACTIVE",
      },
    });
    created.projectIds.push(project.id);
    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: "P4-COMM",
        name: "Commercial Site",
        location: "Gurugram",
        status: "ACTIVE",
      },
    });
    created.siteIds.push(site.id);
    const category = await testDb!.materialCategory.create({
      data: { code: `P4FCAT-${tag}`, name: `Commercial Category ${tag}` },
    });
    created.categoryIds.push(category.id);
    const unit = await testDb!.unitOfMeasure.create({
      data: {
        code: `P4FU-${tag}`,
        name: `Commercial Unit ${tag}`,
        symbol: "cu",
      },
    });
    created.unitIds.push(unit.id);
    const material = await testDb!.material.create({
      data: {
        materialCode: `P4FM-${tag}`,
        name: `Commercial Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
      },
    });
    created.materialIds.push(material.id);

    const suppliers = [];
    for (const suffix of ["A", "B", "C"]) {
      const supplier = await testDb!.supplier.create({
        data: {
          supplierCode: `P4F${suffix}-${tag}`,
          legalName: `Commercial Supplier ${suffix} ${tag}`,
          city: "Delhi",
          state: "Delhi",
        },
      });
      suppliers.push(supplier);
      created.supplierIds.push(supplier.id);
    }

    const manager = await testDb!.user.create({
      data: {
        email: `p4-pm-${tag.toLowerCase()}@kdipl.test`,
        emailNormalized: `p4-pm-${tag.toLowerCase()}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: "Commercial Purchase Manager",
      },
    });
    const director = await testDb!.user.create({
      data: {
        email: `p4-pd-${tag.toLowerCase()}@kdipl.test`,
        emailNormalized: `p4-pd-${tag.toLowerCase()}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: "Commercial Project Director",
      },
    });
    created.userIds.push(manager.id, director.id);

    const now = new Date();
    const requirement = await testDb!.materialRequirement.create({
      data: {
        requirementNumber: `P4F-MR-${tag}`,
        projectId: project.id,
        siteId: site.id,
        status: "APPROVED",
        neededBy: new Date(`${now.getUTCFullYear() + 1}-11-01T00:00:00.000Z`),
        purpose: "Approved commercial demand",
        createdById: manager.id,
        submittedById: manager.id,
        submittedByRole: "PROJECT_MANAGER",
        submittedAt: now,
        decidedById: director.id,
        decidedAt: now,
        lines: {
          create: {
            materialId: material.id,
            unitId: unit.id,
            quantity: "8.500",
          },
        },
      },
    });
    created.requirementIds.push(requirement.id);
    const requirementLine =
      await testDb!.materialRequirementLine.findFirstOrThrow({
        where: { requirementId: requirement.id },
      });

    const managerPrincipal: AuthenticatedPrincipal = {
      userId: manager.id,
      displayName: manager.displayName,
      email: manager.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["PURCHASE_MANAGER"],
      permissions: ["app.access", "purchase.view", "purchase.create"],
    };
    const directorPrincipal: AuthenticatedPrincipal = {
      userId: director.id,
      displayName: director.displayName,
      email: director.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["PROJECT_DIRECTOR"],
      permissions: ["app.access", "purchase.view", "purchase.approve"],
    };

    const draft = await RfqService.saveDraft(managerPrincipal, {
      requirementId: requirement.id,
      responseDueDate: `${now.getUTCFullYear() + 1}-09-01`,
      supplierIds: suppliers.map(({ id }) => id),
      notes: "Issue to three active suppliers.",
    });
    created.rfqIds.push(draft.id);

    await expect(
      RfqService.issue(
        {
          ...managerPrincipal,
          roleCodes: ["SYSTEM_ADMINISTRATOR", "PURCHASE_MANAGER"],
        },
        draft.id,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await RfqService.issue(managerPrincipal, draft.id);
    const quotation = await RfqService.recordQuotation(
      managerPrincipal,
      {
        rfqId: draft.id,
        supplierId: suppliers[0].id,
        quoteReference: `QUOTE-${tag}`,
        quoteDate: `${now.getUTCFullYear() + 1}-08-01`,
        validUntil: `${now.getUTCFullYear() + 1}-10-01`,
        offeredDeliveryDate: `${now.getUTCFullYear() + 1}-10-15`,
        paymentTerms: "30 days from invoice",
        gstRate: "18",
        freightAmount: "25",
        linePrices: [
          { requirementLineId: requirementLine.id, unitPrice: "100" },
        ],
      },
      {
        filename: `quotation-${tag}.pdf`,
        mimeType: "application/pdf",
        size: 128,
        storageKey: `supplier_quotation/test/${tag}.pdf`,
        storageProvider: "LOCAL",
        scanProvider: "LOCAL_SIGNATURE_SCANNER",
        scanReference: "NO_BLOCKED_SIGNATURE",
        scannedAt: new Date(),
        retentionUntil: new Date("2035-03-31T00:00:00.000Z"),
      },
    );

    const storedQuotation = await testDb!.supplierQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      include: { lines: true, documents: true },
    });
    expect(storedQuotation.subtotal.toFixed(2)).toBe("850.00");
    expect(storedQuotation.gstAmount.toFixed(2)).toBe("153.00");
    expect(storedQuotation.landedTotal.toFixed(2)).toBe("1028.00");
    expect(storedQuotation.lines).toHaveLength(1);
    expect(storedQuotation.documents).toHaveLength(1);

    await RfqService.recommend(managerPrincipal, {
      rfqId: draft.id,
      quotationId: quotation.id,
      reason: "Best evaluated landed cost and acceptable delivery date.",
    });

    await expect(
      RfqService.decide(
        {
          ...managerPrincipal,
          roleCodes: ["PURCHASE_MANAGER", "PROJECT_DIRECTOR"],
          permissions: [...managerPrincipal.permissions, "purchase.approve"],
        },
        { rfqId: draft.id, decision: "APPROVE" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const decision = await RfqService.decide(directorPrincipal, {
      rfqId: draft.id,
      decision: "APPROVE",
    });
    expect(decision.purchaseOrderId).toBeDefined();

    const approved = await testDb!.requestForQuotation.findUniqueOrThrow({
      where: { id: draft.id },
      include: {
        workflowEvents: { orderBy: { createdAt: "asc" } },
        purchaseOrder: { include: { lines: true } },
      },
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.workflowEvents.map(({ action }) => action)).toEqual([
      "ISSUE",
      "RECOMMEND",
      "APPROVE",
    ]);
    expect(approved.purchaseOrder).toMatchObject({
      status: "DRAFT",
      supplierId: suppliers[0].id,
    });
    expect(approved.purchaseOrder?.totalAmount.toFixed(2)).toBe("1028.00");
    expect(approved.purchaseOrder?.lines).toHaveLength(1);
  });
});
