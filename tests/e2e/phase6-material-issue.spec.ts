import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "@playwright/test";

import { PrismaClient } from "../../src/generated/prisma/client";

const connectionString =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const testDb = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page
    .getByLabel("Password")
    .fill(process.env.DEMO_BUSINESS_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signOut(page: import("@playwright/test").Page) {
  await page.locator('header button[aria-haspopup="menu"]').last().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test.afterAll(async () => testDb?.$disconnect());

test("Store Keeper posts a material issue and assigned Site Supervisor acknowledges it", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.DEMO_BUSINESS_PASSWORD || !testDb,
    "Demo business credentials and a database are required.",
  );

  const tag = `${testInfo.project.name.startsWith("desktop") ? "D" : "M"}${randomUUID().slice(0, 6).toUpperCase()}`;
  const [material, storeKeeper, supervisor] = await Promise.all([
    testDb!.material.findUniqueOrThrow({
      where: { materialCode: "MAT-PVC-25MM" },
    }),
    testDb!.user.findUniqueOrThrow({
      where: { emailNormalized: "store.keeper@kdipl.test" },
    }),
    testDb!.user.findUniqueOrThrow({
      where: { emailNormalized: "site.supervisor@kdipl.test" },
      include: {
        employee: {
          include: {
            siteAssignments: {
              where: {
                role: "SITE_SUPERVISOR",
                isActive: true,
                site: { status: "ACTIVE", project: { status: "ACTIVE" } },
              },
              take: 1,
              include: { site: { include: { project: true } } },
            },
          },
        },
      },
    }),
  ]);
  const assignment = supervisor.employee?.siteAssignments[0];
  expect(assignment).toBeTruthy();
  const source = await testDb!.inventoryLocation.create({
    data: {
      locationCode: `E2E-P6-${tag}`,
      name: `E2E Phase 6 Source ${tag}`,
      type: "CENTRAL_STORE",
    },
  });
  await testDb!.stockTransaction.create({
    data: {
      transactionNumber: `EO-${tag}`,
      type: "OPENING",
      locationId: source.id,
      materialId: material.id,
      unitId: material.defaultUnitId,
      quantity: "8.000",
      createdById: storeKeeper.id,
    },
  });
  const purpose = `E2E installation ${tag}`;

  await signIn(page, "store.keeper@kdipl.test");
  await page.goto("/inventory");
  await page.getByLabel("Available stock").selectOption({
    label: `${source.locationCode} · ${material.name} · 8.000 ${await testDb!.unitOfMeasure.findUniqueOrThrow({ where: { id: material.defaultUnitId } }).then((unit) => unit.symbol)}`,
  });
  await page.getByLabel("Destination site").selectOption({
    label: `${assignment!.site.project.projectCode} · ${assignment!.site.name} (${assignment!.site.siteCode})`,
  });
  await page.getByLabel("Issue quantity").fill("3");
  await page.getByLabel("Purpose / work reference").fill(purpose);
  await page.getByRole("button", { name: "Create issue draft" }).click();
  await expect(page.getByText("Material issue draft created.")).toBeVisible();

  const issue = await testDb!.materialIssue.findFirstOrThrow({
    where: { purpose },
  });
  const issueCard = page.getByTestId(`material-issue-${issue.id}`);
  await expect(issueCard.getByText("Draft", { exact: true })).toBeVisible();
  await issueCard.getByRole("button", { name: "Post material issue" }).click();
  await expect(issueCard.getByText("Posted", { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, "site.supervisor@kdipl.test");
  await page.goto("/inventory");
  const supervisorCard = page.getByTestId(`material-issue-${issue.id}`);
  await expect(supervisorCard).toBeVisible();
  await supervisorCard
    .getByRole("button", { name: "Acknowledge at site" })
    .click();
  await expect(
    supervisorCard.getByText("Acknowledged", { exact: true }),
  ).toBeVisible();

  const [persisted, balance, auditCount] = await Promise.all([
    testDb!.materialIssue.findUniqueOrThrow({ where: { id: issue.id } }),
    testDb!.$queryRaw<{ quantityOnHand: string }[]>`
      SELECT "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" = ${source.id}::uuid
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${material.defaultUnitId}::uuid
    `,
    testDb!.auditLog.count({
      where: { entityType: "MaterialIssue", entityId: issue.id },
    }),
  ]);
  expect(persisted.status).toBe("ACKNOWLEDGED");
  expect(balance).toEqual([{ quantityOnHand: "5.000" }]);
  expect(auditCount).toBe(3);
});
