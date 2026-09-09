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

test("Store Keeper dispatches stock and assigned Site Supervisor receives it", async ({
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
      include: { defaultUnit: true },
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
  const [source, destination] = await Promise.all([
    testDb!.inventoryLocation.create({
      data: {
        locationCode: `E2E-TR-SRC-${tag}`,
        name: `E2E Transfer Source ${tag}`,
        type: "CENTRAL_STORE",
      },
    }),
    testDb!.inventoryLocation.create({
      data: {
        locationCode: `E2E-TR-DST-${tag}`,
        name: `E2E Transfer Destination ${tag}`,
        type: "SITE_STORE",
        projectId: assignment!.site.projectId,
        siteId: assignment!.siteId,
      },
    }),
  ]);
  await testDb!.stockTransaction.create({
    data: {
      transactionNumber: `ET-${tag}`,
      type: "OPENING",
      locationId: source.id,
      materialId: material.id,
      unitId: material.defaultUnitId,
      quantity: "9.000",
      createdById: storeKeeper.id,
    },
  });
  const notes = `E2E stock transfer ${tag}`;

  await signIn(page, "store.keeper@kdipl.test");
  await page.goto("/inventory");
  await page.getByLabel("Transfer stock").selectOption({
    label: `${source.locationCode} · ${material.name} · 9.000 ${material.defaultUnit.symbol}`,
  });
  await page.getByLabel("Destination location").selectOption({
    label: `${destination.locationCode} · ${destination.name}`,
  });
  await page.getByLabel("Transfer quantity").fill("4");
  await page.getByLabel("Purpose", { exact: true }).selectOption("ROUTINE");
  await page.getByLabel("Transfer notes").fill(notes);
  await page.getByRole("button", { name: "Create transfer draft" }).click();
  await expect
    .poll(
      () => testDb!.stockTransfer.findFirst({ where: { notes } }).then(Boolean),
      { timeout: 15_000 },
    )
    .toBe(true);
  const transfer = await testDb!.stockTransfer.findFirstOrThrow({
    where: { notes },
  });
  const card = page.getByTestId(`stock-transfer-${transfer.id}`);
  await expect(card.getByText("Draft", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Dispatch transfer" }).click();
  await expect(card.getByText("Dispatched", { exact: true })).toBeVisible();
  await signOut(page);

  await signIn(page, "site.supervisor@kdipl.test");
  await page.goto("/inventory");
  const destinationCard = page.getByTestId(`stock-transfer-${transfer.id}`);
  await expect(destinationCard).toBeVisible();
  await destinationCard
    .getByRole("button", { name: "Receive at destination" })
    .click();
  await expect(
    destinationCard.getByText("Received", { exact: true }),
  ).toBeVisible();

  const [persisted, balances, auditCount] = await Promise.all([
    testDb!.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } }),
    testDb!.$queryRaw<Array<{ locationId: string; quantityOnHand: string }>>`
      SELECT "locationId", "quantityOnHand"::text AS "quantityOnHand"
      FROM "InventoryStockBalance"
      WHERE "locationId" IN (${source.id}::uuid, ${destination.id}::uuid)
        AND "materialId" = ${material.id}::uuid
        AND "unitId" = ${material.defaultUnitId}::uuid
      ORDER BY "quantityOnHand"
    `,
    testDb!.auditLog.count({
      where: { entityType: "StockTransfer", entityId: transfer.id },
    }),
  ]);
  expect(persisted.status).toBe("RECEIVED");
  expect(balances.map(({ quantityOnHand }) => quantityOnHand).sort()).toEqual([
    "4.000",
    "5.000",
  ]);
  expect(auditCount).toBe(3);
});
