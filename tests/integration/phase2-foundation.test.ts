import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const enabled =
  process.env.RUN_DATABASE_TESTS === "1" && Boolean(testDatabaseUrl);
const testDb =
  enabled && testDatabaseUrl
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
      })
    : null;

const createdIds = {
  siteAssignments: [] as string[],
  projectAssignments: [] as string[],
  sites: [] as string[],
  projects: [] as string[],
  supplierContacts: [] as string[],
  suppliers: [] as string[],
  materials: [] as string[],
  categories: [] as string[],
  units: [] as string[],
  clients: [] as string[],
  employees: [] as string[],
};

describe.skipIf(!enabled)("Phase 2 PostgreSQL foundation", () => {
  afterEach(async () => {
    await testDb!.$transaction([
      testDb!.siteAssignment.deleteMany({
        where: { id: { in: createdIds.siteAssignments } },
      }),
      testDb!.projectAssignment.deleteMany({
        where: { id: { in: createdIds.projectAssignments } },
      }),
      testDb!.site.deleteMany({ where: { id: { in: createdIds.sites } } }),
      testDb!.project.deleteMany({
        where: { id: { in: createdIds.projects } },
      }),
      testDb!.supplierContact.deleteMany({
        where: { id: { in: createdIds.supplierContacts } },
      }),
      testDb!.supplier.deleteMany({
        where: { id: { in: createdIds.suppliers } },
      }),
      testDb!.material.deleteMany({
        where: { id: { in: createdIds.materials } },
      }),
      testDb!.materialCategory.deleteMany({
        where: { id: { in: createdIds.categories } },
      }),
      testDb!.unitOfMeasure.deleteMany({
        where: { id: { in: createdIds.units } },
      }),
      testDb!.client.deleteMany({ where: { id: { in: createdIds.clients } } }),
      testDb!.employee.deleteMany({
        where: { id: { in: createdIds.employees } },
      }),
    ]);

    for (const ids of Object.values(createdIds)) ids.length = 0;
  });

  afterAll(async () => testDb?.$disconnect());

  it("persists the client-project-site hierarchy and protects assigned employees", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const client = await testDb!.client.create({
      data: {
        clientCode: `P2C-${tag}`,
        name: `Phase 2 Client ${tag}`,
      },
    });
    createdIds.clients.push(client.id);

    const employee = await testDb!.employee.create({
      data: {
        employeeCode: `P2E-${tag}`,
        fullName: `Phase 2 Employee ${tag}`,
      },
    });
    createdIds.employees.push(employee.id);

    const project = await testDb!.project.create({
      data: {
        projectCode: `P2P-${tag}`,
        name: `Phase 2 Project ${tag}`,
        clientId: client.id,
        location: "Gurugram",
        startDate: new Date("2026-08-24T00:00:00.000Z"),
      },
    });
    createdIds.projects.push(project.id);

    const site = await testDb!.site.create({
      data: {
        projectId: project.id,
        siteCode: "SITE-01",
        name: "Main Site",
        location: "Gurugram",
      },
    });
    createdIds.sites.push(site.id);

    const projectAssignment = await testDb!.projectAssignment.create({
      data: {
        projectId: project.id,
        employeeId: employee.id,
        role: "PROJECT_MANAGER",
        isPrimary: true,
      },
    });
    createdIds.projectAssignments.push(projectAssignment.id);

    const siteAssignment = await testDb!.siteAssignment.create({
      data: {
        siteId: site.id,
        employeeId: employee.id,
        role: "SITE_SUPERVISOR",
        isPrimary: true,
      },
    });
    createdIds.siteAssignments.push(siteAssignment.id);

    const persisted = await testDb!.project.findUniqueOrThrow({
      where: { id: project.id },
      include: {
        client: true,
        sites: { include: { assignments: { include: { employee: true } } } },
        assignments: { include: { employee: true } },
      },
    });

    expect(persisted).toMatchObject({
      status: "PLANNING",
      client: { clientCode: `P2C-${tag}` },
      assignments: [
        {
          role: "PROJECT_MANAGER",
          isPrimary: true,
          employee: { employeeCode: `P2E-${tag}` },
        },
      ],
      sites: [
        {
          siteCode: "SITE-01",
          status: "PLANNING",
          assignments: [
            {
              role: "SITE_SUPERVISOR",
              isPrimary: true,
              employee: { employeeCode: `P2E-${tag}` },
            },
          ],
        },
      ],
    });

    await expect(
      testDb!.site.create({
        data: {
          projectId: project.id,
          siteCode: "SITE-01",
          name: "Duplicate Site",
          location: "Gurugram",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      testDb!.employee.delete({ where: { id: employee.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("protects material masters and supplier-contact history", async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const category = await testDb!.materialCategory.create({
      data: {
        code: `P2CAT-${tag}`,
        name: `Phase 2 Category ${tag}`,
      },
    });
    createdIds.categories.push(category.id);

    const unit = await testDb!.unitOfMeasure.create({
      data: {
        code: `P2U-${tag}`,
        name: `Phase 2 Unit ${tag}`,
        symbol: "p2",
        decimalScale: 3,
      },
    });
    createdIds.units.push(unit.id);

    const material = await testDb!.material.create({
      data: {
        materialCode: `P2M-${tag}`,
        name: `Phase 2 Material ${tag}`,
        categoryId: category.id,
        defaultUnitId: unit.id,
        minimumStockLevel: "5.250",
        reorderLevel: "8.500",
      },
      include: { category: true, defaultUnit: true },
    });
    createdIds.materials.push(material.id);

    expect(material.category.code).toBe(`P2CAT-${tag}`);
    expect(material.defaultUnit.code).toBe(`P2U-${tag}`);
    expect(Number(material.minimumStockLevel)).toBe(5.25);
    expect(Number(material.reorderLevel)).toBe(8.5);
    await expect(
      testDb!.materialCategory.delete({ where: { id: category.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      testDb!.unitOfMeasure.delete({ where: { id: unit.id } }),
    ).rejects.toMatchObject({ code: "P2003" });

    const supplier = await testDb!.supplier.create({
      data: {
        supplierCode: `P2S-${tag}`,
        legalName: `Phase 2 Supplier ${tag}`,
        city: "Mumbai",
        state: "Maharashtra",
        contacts: {
          create: {
            name: "Primary Contact",
            email: `contact-${tag.toLowerCase()}@example.test`,
            isPrimary: true,
          },
        },
      },
      include: { contacts: true },
    });
    createdIds.suppliers.push(supplier.id);
    createdIds.supplierContacts.push(...supplier.contacts.map(({ id }) => id));

    expect(supplier.contacts).toMatchObject([
      { name: "Primary Contact", isPrimary: true },
    ]);
    await expect(
      testDb!.supplier.delete({ where: { id: supplier.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    expect(
      await testDb!.supplierContact.count({
        where: { supplierId: supplier.id },
      }),
    ).toBe(1);

    await testDb!.supplierContact.deleteMany({
      where: { supplierId: supplier.id },
    });
    await testDb!.supplier.delete({ where: { id: supplier.id } });
    expect(
      await testDb!.supplier.findUnique({ where: { id: supplier.id } }),
    ).toBeNull();
  });
});
