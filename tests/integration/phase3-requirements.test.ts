import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";
import { RequirementService } from "@/features/requirements/requirement-service";
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
  requirementIds: [] as string[],
  materialIds: [] as string[],
  categoryIds: [] as string[],
  unitIds: [] as string[],
  siteIds: [] as string[],
  projectIds: [] as string[],
  clientIds: [] as string[],
  employeeIds: [] as string[],
  userIds: [] as string[],
};

describe.skipIf(!enabled)("Phase 3 draft requirement foundation", () => {
  afterEach(async () => {
    await testDb!.$transaction([
      testDb!.auditLog.deleteMany({
        where: { entityId: { in: created.requirementIds } },
      }),
      testDb!.materialRequirementWorkflowEvent.deleteMany({
        where: { requirementId: { in: created.requirementIds } },
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
      testDb!.siteAssignment.deleteMany({
        where: { siteId: { in: created.siteIds } },
      }),
      testDb!.projectAssignment.deleteMany({
        where: { projectId: { in: created.projectIds } },
      }),
      testDb!.site.deleteMany({ where: { id: { in: created.siteIds } } }),
      testDb!.project.deleteMany({ where: { id: { in: created.projectIds } } }),
      testDb!.client.deleteMany({ where: { id: { in: created.clientIds } } }),
      testDb!.user.deleteMany({ where: { id: { in: created.userIds } } }),
      testDb!.employee.deleteMany({
        where: { id: { in: created.employeeIds } },
      }),
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

  it("submits, sends back, resubmits, and approves with immutable history", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const client = await testDb!.client.create({
      data: { clientCode: `P3W-${tag}`, name: `Workflow Client ${tag}` },
    });
    created.clientIds.push(client.id);
    const project = await testDb!.project.create({
      data: {
        projectCode: `P3W-${tag}`,
        name: `Workflow Project ${tag}`,
        clientId: client.id,
        location: "Gurugram",
        status: "ACTIVE",
      },
    });
    created.projectIds.push(project.id);
    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: "WF-SITE",
        name: "Workflow Site",
        location: "Gurugram",
        status: "ACTIVE",
      },
    });
    created.siteIds.push(site.id);
    const category = await testDb!.materialCategory.create({
      data: { code: `P3WC-${tag}`, name: `Workflow Category ${tag}` },
    });
    created.categoryIds.push(category.id);
    const unit = await testDb!.unitOfMeasure.create({
      data: {
        code: `P3WU-${tag}`,
        name: `Workflow Unit ${tag}`,
        symbol: "wf",
      },
    });
    created.unitIds.push(unit.id);
    const material = await testDb!.material.create({
      data: {
        materialCode: `P3WM-${tag}`,
        name: `Workflow Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
      },
    });
    created.materialIds.push(material.id);
    const [supervisorEmployee, managerEmployee] = await Promise.all([
      testDb!.employee.create({
        data: { employeeCode: `P3SS-${tag}`, fullName: "Site Supervisor" },
      }),
      testDb!.employee.create({
        data: { employeeCode: `P3PM-${tag}`, fullName: "Project Manager" },
      }),
    ]);
    created.employeeIds.push(supervisorEmployee.id, managerEmployee.id);
    const [supervisorUser, managerUser] = await Promise.all([
      testDb!.user.create({
        data: {
          email: `p3ss-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p3ss-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: "Site Supervisor",
          employeeId: supervisorEmployee.id,
        },
      }),
      testDb!.user.create({
        data: {
          email: `p3pm-${tag.toLowerCase()}@kdipl.test`,
          emailNormalized: `p3pm-${tag.toLowerCase()}@kdipl.test`,
          passwordHash: "integration-test",
          displayName: "Project Manager",
          employeeId: managerEmployee.id,
        },
      }),
    ]);
    created.userIds.push(supervisorUser.id, managerUser.id);
    await Promise.all([
      testDb!.siteAssignment.create({
        data: {
          siteId: site.id,
          employeeId: supervisorEmployee.id,
          role: "SITE_SUPERVISOR",
        },
      }),
      testDb!.projectAssignment.create({
        data: {
          projectId: project.id,
          employeeId: managerEmployee.id,
          role: "PROJECT_MANAGER",
        },
      }),
    ]);
    const supervisor: AuthenticatedPrincipal = {
      userId: supervisorUser.id,
      displayName: supervisorUser.displayName,
      email: supervisorUser.email,
      employeeId: supervisorEmployee.id,
      mustChangePassword: false,
      roleCodes: ["SITE_SUPERVISOR"],
      permissions: [
        "app.access",
        "material_requirement.view",
        "material_requirement.create",
      ],
    };
    const manager: AuthenticatedPrincipal = {
      userId: managerUser.id,
      displayName: managerUser.displayName,
      email: managerUser.email,
      employeeId: managerEmployee.id,
      mustChangePassword: false,
      roleCodes: ["PROJECT_MANAGER"],
      permissions: [
        "app.access",
        "material_requirement.view",
        "material_requirement.approve",
      ],
    };
    const draft = await RequirementService.saveDraft(supervisor, {
      projectId: project.id,
      siteId: site.id,
      neededBy: "2026-10-01",
      purpose: "Exercise the controlled workflow",
      lines: [{ materialId: material.id, quantity: "4" }],
    });
    created.requirementIds.push(draft.id);

    await RequirementService.submit(supervisor, { requirementId: draft.id });
    await RequirementService.decide(manager, {
      requirementId: draft.id,
      decision: "SEND_BACK",
      reason: "Add delivery sequencing notes.",
    });
    expect(
      await testDb!.materialRequirement.findUniqueOrThrow({
        where: { id: draft.id },
        select: { status: true, submittedById: true },
      }),
    ).toEqual({ status: "DRAFT", submittedById: null });

    await RequirementService.submit(supervisor, { requirementId: draft.id });
    await RequirementService.decide(manager, {
      requirementId: draft.id,
      decision: "APPROVE",
    });

    const approved = await testDb!.materialRequirement.findUniqueOrThrow({
      where: { id: draft.id },
      include: { workflowEvents: { orderBy: { createdAt: "asc" } } },
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.submittedByRole).toBe("SITE_SUPERVISOR");
    expect(approved.decidedById).toBe(managerUser.id);
    expect(approved.workflowEvents.map(({ action }) => action)).toEqual([
      "SUBMIT",
      "SEND_BACK",
      "SUBMIT",
      "APPROVE",
    ]);
    expect(
      await testDb!.auditLog.count({
        where: { entityType: "MaterialRequirement", entityId: draft.id },
      }),
    ).toBe(5);
  });
});
