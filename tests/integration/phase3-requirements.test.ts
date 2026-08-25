import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";
import { RequirementService } from "@/features/requirements/requirement-service";
import type { AuthenticatedPrincipal } from "@/types/application";

const connectionString = process.env.TEST_DATABASE_URL ?? "";
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && connectionString.length > 0;
const testDb = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

const created = {
  requirementIds: [] as string[],
  materialIds: [] as string[],
  categoryIds: [] as string[],
  unitIds: [] as string[],
  siteIds: [] as string[],
  projectIds: [] as string[],
  clientIds: [] as string[],
  userIds: [] as string[],
};

describe.skipIf(!enabled)("Phase 3 draft requirement foundation", () => {
  afterEach(async () => {
    await testDb!.$transaction([
      testDb!.auditLog.deleteMany({
        where: { entityId: { in: created.requirementIds } },
      }),
      testDb!.materialRequirementLine.deleteMany({
        where: { requirementId: { in: created.requirementIds } },
      }),
      testDb!.materialRequirement.deleteMany({
        where: { id: { in: created.requirementIds } },
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

  it("creates a numbered, audited draft with trusted unit snapshots", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const client = await testDb!.client.create({
      data: { clientCode: `P3C-${tag}`, name: `Phase 3 Client ${tag}` },
    });
    created.clientIds.push(client.id);
    const project = await testDb!.project.create({
      data: {
        projectCode: `P3P-${tag}`,
        name: `Phase 3 Project ${tag}`,
        clientId: client.id,
        location: "Noida",
        status: "ACTIVE",
      },
    });
    created.projectIds.push(project.id);
    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: "P3-SITE",
        name: "Phase 3 Site",
        location: "Noida",
        status: "ACTIVE",
      },
    });
    created.siteIds.push(site.id);
    const category = await testDb!.materialCategory.create({
      data: { code: `P3CAT-${tag}`, name: `Phase 3 Category ${tag}` },
    });
    created.categoryIds.push(category.id);
    const unit = await testDb!.unitOfMeasure.create({
      data: { code: `P3U-${tag}`, name: `Phase 3 Unit ${tag}`, symbol: "p3" },
    });
    created.unitIds.push(unit.id);
    const material = await testDb!.material.create({
      data: {
        materialCode: `P3M-${tag}`,
        name: `Phase 3 Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
      },
    });
    created.materialIds.push(material.id);
    const user = await testDb!.user.create({
      data: {
        email: `p3-${tag.toLowerCase()}@kdipl.test`,
        emailNormalized: `p3-${tag.toLowerCase()}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: "Phase 3 Creator",
      },
    });
    created.userIds.push(user.id);
    const principal: AuthenticatedPrincipal = {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      employeeId: null,
      mustChangePassword: false,
      roleCodes: ["SYSTEM_ADMINISTRATOR"],
      permissions: [
        "app.access",
        "material_requirement.view",
        "material_requirement.create",
      ],
    };

    const result = await RequirementService.saveDraft(principal, {
      projectId: project.id,
      siteId: site.id,
      neededBy: "2026-09-15",
      purpose: "Phase 3 integration requirement",
      notes: "Created atomically.",
      lines: [
        { materialId: material.id, quantity: "12.500", notes: "Test line" },
      ],
    });
    created.requirementIds.push(result.id);

    const requirement = await testDb!.materialRequirement.findUniqueOrThrow({
      where: { id: result.id },
      include: { lines: true },
    });
    expect(requirement.requirementNumber).toMatch(/^MR-2026-\d{4}$/);
    expect(requirement.status).toBe("DRAFT");
    expect(requirement.lines).toMatchObject([
      {
        materialId: material.id,
        unitId: unit.id,
        quantity: expect.objectContaining({}),
        isActive: true,
      },
    ]);
    expect(Number(requirement.lines[0]!.quantity)).toBe(12.5);
    expect(
      await testDb!.auditLog.count({
        where: { entityType: "MaterialRequirement", entityId: result.id },
      }),
    ).toBe(1);
  });

  it("rejects a site that does not belong to the selected project", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const client = await testDb!.client.create({
      data: { clientCode: `P3X-${tag}`, name: `Phase 3 Cross ${tag}` },
    });
    created.clientIds.push(client.id);
    const projects = await Promise.all(
      ["A", "B"].map((suffix) =>
        testDb!.project.create({
          data: {
            projectCode: `P3${suffix}-${tag}`,
            name: `Phase 3 ${suffix} ${tag}`,
            clientId: client.id,
            location: "Delhi",
          },
        }),
      ),
    );
    created.projectIds.push(...projects.map(({ id }) => id));
    const site = await testDb!.site.create({
      data: {
        projectId: projects[0]!.id,
        siteCode: "ONLY-A",
        name: "Only Project A",
        location: "Delhi",
      },
    });
    created.siteIds.push(site.id);
    const user = await testDb!.user.create({
      data: {
        email: `p3x-${tag.toLowerCase()}@kdipl.test`,
        emailNormalized: `p3x-${tag.toLowerCase()}@kdipl.test`,
        passwordHash: "integration-test",
        displayName: "Phase 3 Cross Creator",
      },
    });
    created.userIds.push(user.id);

    await expect(
      testDb!.materialRequirement.create({
        data: {
          requirementNumber: `P3-X-${tag}`,
          projectId: projects[1]!.id,
          siteId: site.id,
          neededBy: new Date("2026-09-15T00:00:00.000Z"),
          purpose: "Invalid cross-project requirement",
          createdById: user.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
