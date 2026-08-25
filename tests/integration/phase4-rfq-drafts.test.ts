import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { RfqService } from "@/features/procurement/rfq-service";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { AuthenticatedPrincipal } from "@/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
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

describe.skipIf(!enabled)("Phase 4 RFQ draft foundation", () => {
  afterEach(async () => {
    await testDb!.$transaction([
      testDb!.auditLog.deleteMany({
        where: { entityId: { in: created.rfqIds } },
      }),
      testDb!.requestForQuotationSupplier.deleteMany({
        where: { rfqId: { in: created.rfqIds } },
      }),
      testDb!.requestForQuotation.deleteMany({
        where: { id: { in: created.rfqIds } },
      }),
      testDb!.materialRequirementLine.deleteMany({
        where: { requirementId: { in: created.requirementIds } },
      }),
      testDb!.materialRequirement.deleteMany({
        where: { id: { in: created.requirementIds } },
      }),
      testDb!.supplier.deleteMany({
        where: { id: { in: created.supplierIds } },
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
      testDb!.project.deleteMany({ where: { id: { in: created.projectIds } } }),
      testDb!.client.deleteMany({ where: { id: { in: created.clientIds } } }),
      testDb!.user.deleteMany({ where: { id: { in: created.userIds } } }),
    ]);
    for (const ids of Object.values(created)) ids.length = 0;
  });

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
});
