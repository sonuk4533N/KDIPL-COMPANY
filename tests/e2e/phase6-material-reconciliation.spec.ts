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

test("Site Supervisor reconciles material and Store Keeper completes project close", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.DEMO_BUSINESS_PASSWORD || !testDb,
    "Demo business credentials and a database are required.",
  );

  const tag = `${testInfo.project.name.startsWith("desktop") ? "D" : "M"}${randomUUID().slice(0, 6).toUpperCase()}`;
  const [material, storeKeeper, supervisor, site] = await Promise.all([
    testDb!.material.findUniqueOrThrow({
      where: { materialCode: "MAT-PVC-25MM" },
      include: { defaultUnit: true },
    }),
    testDb!.user.findUniqueOrThrow({
      where: { emailNormalized: "store.keeper@kdipl.test" },
    }),
    testDb!.user.findUniqueOrThrow({
      where: { emailNormalized: "site.supervisor@kdipl.test" },
    }),
    testDb!.site.findFirstOrThrow({
      where: {
        status: "ACTIVE",
        assignments: {
          some: {
            employee: {
              user: { emailNormalized: "site.supervisor@kdipl.test" },
            },
            role: "SITE_SUPERVISOR",
            isActive: true,
          },
        },
      },
      include: { project: true },
    }),
  ]);
  const [source, siteStore] = await Promise.all([
    testDb!.inventoryLocation.create({
      data: {
        locationCode: `E2E-REC-SRC-${tag}`,
        name: `E2E Reconciliation Source ${tag}`,
        type: "CENTRAL_STORE",
      },
    }),
    testDb!.inventoryLocation.create({
      data: {
        locationCode: `E2E-REC-SITE-${tag}`,
        name: `E2E Reconciliation Site Store ${tag}`,
        type: "SITE_STORE",
        projectId: site.projectId,
        siteId: site.id,
      },
    }),
  ]);
  await testDb!.stockTransaction.create({
    data: {
      transactionNumber: `ER-OPEN-${tag}`,
      type: "OPENING",
      locationId: source.id,
      materialId: material.id,
      unitId: material.defaultUnitId,
      quantity: "10.000",
      createdById: storeKeeper.id,
    },
  });
  const issue = await testDb!.materialIssue.create({
    data: {
      issueNumber: `ER-ISSUE-${tag}`,
      sourceLocationId: source.id,
      projectId: site.projectId,
      siteId: site.id,
      purpose: "E2E issued-material reconciliation",
      createdById: storeKeeper.id,
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
  await testDb!.materialIssue.update({
    where: { id: issue.id },
    data: {
      status: "POSTED",
      postedById: storeKeeper.id,
      postedAt: new Date(),
    },
  });
  await testDb!.stockTransaction.create({
    data: {
      transactionNumber: `ER-ISSUE-STK-${tag}`,
      type: "ISSUE",
      locationId: source.id,
      materialId: material.id,
      unitId: material.defaultUnitId,
      quantity: "10.000",
      materialIssueLineId: issue.lines[0].id,
      createdById: storeKeeper.id,
    },
  });
  await testDb!.materialIssue.update({
    where: { id: issue.id },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedById: supervisor.id,
      acknowledgedAt: new Date(),
    },
  });

  await signIn(page, "site.supervisor@kdipl.test");
  await page.goto("/inventory");
  await page
    .getByLabel("Acknowledged issued material")
    .selectOption({ value: issue.lines[0].id });
  await page.getByLabel("Consumed").fill("5");
  await page.getByLabel("Unused return").fill("2");
  await page.getByLabel("Wastage").fill("1");
  await page
    .getByLabel("Unused-material return location")
    .selectOption({ value: siteStore.id });
  await page
    .getByLabel("Reconciliation evidence")
    .fill(`E2E partial consumption and return ${tag}`);
  await page
    .getByRole("button", { name: "Create reconciliation draft" })
    .click();
  await expect
    .poll(
      () =>
        testDb!.materialReconciliation
          .findFirst({
            where: { notes: `E2E partial consumption and return ${tag}` },
          })
          .then(Boolean),
      { timeout: 15_000 },
    )
    .toBe(true);
  const routine = await testDb!.materialReconciliation.findFirstOrThrow({
    where: { notes: `E2E partial consumption and return ${tag}` },
  });
  const routineCard = page.getByTestId(`material-reconciliation-${routine.id}`);
  await routineCard
    .getByRole("button", { name: "Post reconciliation" })
    .click();
  await expect(routineCard.getByText("Posted", { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, "store.keeper@kdipl.test");
  await page.goto("/inventory");
  await page
    .getByLabel("Acknowledged issued material")
    .selectOption({ value: issue.lines[0].id });
  await page.getByLabel("Consumed").fill("1");
  await page.getByLabel("Scrap").fill("1");
  await page.getByLabel("Reconciliation purpose").selectOption("PROJECT_CLOSE");
  await page
    .getByLabel("Reconciliation evidence")
    .fill(`E2E final project close ${tag}`);
  await page
    .getByRole("button", { name: "Create reconciliation draft" })
    .click();
  await expect
    .poll(
      () =>
        testDb!.materialReconciliation
          .findFirst({ where: { notes: `E2E final project close ${tag}` } })
          .then(Boolean),
      { timeout: 15_000 },
    )
    .toBe(true);
  const final = await testDb!.materialReconciliation.findFirstOrThrow({
    where: { notes: `E2E final project close ${tag}` },
  });
  const finalCard = page.getByTestId(`material-reconciliation-${final.id}`);
  await finalCard.getByRole("button", { name: "Post reconciliation" }).click();
  await expect(finalCard.getByText("Posted", { exact: true })).toBeVisible();

  const [persisted, returnBalance, remainingRows] = await Promise.all([
    testDb!.materialReconciliation.findUniqueOrThrow({
      where: { id: final.id },
    }),
    testDb!.$queryRaw<Array<{ quantityOnHand: string }>>`
      SELECT "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" = ${siteStore.id}::uuid
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${material.defaultUnitId}::uuid
    `,
    testDb!.materialReconciliation.count({
      where: { materialIssueLineId: issue.lines[0].id, status: "POSTED" },
    }),
  ]);
  expect(persisted).toMatchObject({
    status: "POSTED",
    purpose: "PROJECT_CLOSE",
  });
  expect(returnBalance).toEqual([{ quantityOnHand: "2.000" }]);
  expect(remainingRows).toBe(2);
});
