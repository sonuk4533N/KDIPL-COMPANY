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

test("Store Keeper posts a stock decrease after independent Project Director approval", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.DEMO_BUSINESS_PASSWORD || !testDb,
    "Demo business credentials and a database are required.",
  );

  const tag = `${testInfo.project.name.startsWith("desktop") ? "D" : "M"}${randomUUID().slice(0, 6).toUpperCase()}`;
  const [material, storeKeeper] = await Promise.all([
    testDb!.material.findUniqueOrThrow({
      where: { materialCode: "MAT-PVC-25MM" },
      include: { defaultUnit: true },
    }),
    testDb!.user.findUniqueOrThrow({
      where: { emailNormalized: "store.keeper@kdipl.test" },
    }),
  ]);
  const location = await testDb!.inventoryLocation.create({
    data: {
      locationCode: `E2E-ADJ-${tag}`,
      name: `E2E Adjustment Location ${tag}`,
      type: "CENTRAL_STORE",
    },
  });
  await testDb!.stockTransaction.create({
    data: {
      transactionNumber: `EA-${tag}`,
      type: "OPENING",
      locationId: location.id,
      materialId: material.id,
      unitId: material.defaultUnitId,
      quantity: "10.000",
      createdById: storeKeeper.id,
    },
  });
  const reason = `E2E verified damaged stock ${tag}`;

  await signIn(page, "store.keeper@kdipl.test");
  await page.goto("/inventory");
  await page.getByLabel("Adjustment location").selectOption({
    label: `${location.locationCode} · ${location.name}`,
  });
  await page.getByLabel("Adjustment material").selectOption({
    label: `${material.materialCode} · ${material.name} (${material.defaultUnit.symbol})`,
  });
  await page.getByLabel("Adjustment direction").selectOption("OUT");
  await page.getByLabel("Adjustment quantity").fill("3");
  await page.getByLabel("Adjustment reason").fill(reason);
  await page.getByRole("button", { name: "Create adjustment draft" }).click();
  await expect
    .poll(
      () =>
        testDb!.stockAdjustment.findFirst({ where: { reason } }).then(Boolean),
      { timeout: 15_000 },
    )
    .toBe(true);
  const adjustment = await testDb!.stockAdjustment.findFirstOrThrow({
    where: { reason },
  });
  const card = page.getByTestId(`stock-adjustment-${adjustment.id}`);
  await expect(card.getByText("Draft", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Submit for approval" }).click();
  await expect(card.getByText("Submitted", { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, "project.director@kdipl.test");
  await page.goto("/inventory");
  const approvalCard = page.getByTestId(`stock-adjustment-${adjustment.id}`);
  await expect(approvalCard).toBeVisible();
  await approvalCard
    .getByLabel("Decision notes")
    .fill("Damage inspection evidence reviewed and approved");
  await approvalCard
    .getByRole("button", { name: "Approve adjustment" })
    .click();
  await expect(
    approvalCard.getByText("Approved", { exact: true }),
  ).toBeVisible();
  await signOut(page);

  await signIn(page, "store.keeper@kdipl.test");
  await page.goto("/inventory");
  const postingCard = page.getByTestId(`stock-adjustment-${adjustment.id}`);
  await postingCard
    .getByRole("button", { name: "Post approved adjustment" })
    .click();
  await expect(postingCard.getByText("Posted", { exact: true })).toBeVisible();

  const [persisted, balance, auditCount] = await Promise.all([
    testDb!.stockAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } }),
    testDb!.$queryRaw<Array<{ quantityOnHand: string }>>`
      SELECT "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" = ${location.id}::uuid
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${material.defaultUnitId}::uuid
    `,
    testDb!.auditLog.count({
      where: { entityType: "StockAdjustment", entityId: adjustment.id },
    }),
  ]);
  expect(persisted.status).toBe("POSTED");
  expect(balance).toEqual([{ quantityOnHand: "7.000" }]);
  expect(auditCount).toBe(4);
});
