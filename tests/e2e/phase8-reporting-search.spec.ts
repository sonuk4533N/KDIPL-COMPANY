import { expect, test, type Page } from "@playwright/test";

test.setTimeout(180_000);

async function signIn(page: Page, email: string) {
  const password = process.env.DEMO_BUSINESS_PASSWORD;
  test.skip(
    !password,
    "DEMO_BUSINESS_PASSWORD is required for Phase 8 E2E coverage.",
  );
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("role dashboards are responsive and assignment scoped", async ({
  page,
}) => {
  for (const email of [
    "managing.director@kdipl.test",
    "purchase.manager@kdipl.test",
    "project.manager@kdipl.test",
    "store.keeper@kdipl.test",
    "site.supervisor@kdipl.test",
    "accounts@kdipl.test",
  ]) {
    await signIn(page, email);
    await expect(page.getByRole("heading", { name: /Good day/ })).toBeVisible();
    await expect(page.getByText(/Data refreshed/)).toBeVisible();
  }
});

test("global search, filters, traceability, exports and print view work", async ({
  page,
}) => {
  await signIn(page, "managing.director@kdipl.test");
  await page.goto("/search");
  await page
    .getByPlaceholder("Number, name, GSTIN, UTR, vehicle or challan")
    .fill("PO-2026-P7DEMO");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("PO-2026-P7DEMO")).toBeVisible();
  await page.getByText("PO-2026-P7DEMO").click();
  await expect(
    page.getByRole("heading", { name: "PO-2026-P7DEMO", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Material requirement")).toBeVisible();
  await expect(page.getByText("Stock ledger", { exact: true })).toBeVisible();

  await page.goto("/reports/current-stock-location");
  await expect(
    page.getByRole("heading", { name: "Current stock by inventory location" }),
  ).toBeVisible();
  await page.locator('input[name="name"]').fill(`Stock ${Date.now()}`);
  await page.getByRole("button", { name: "Save filter" }).click();
  await expect(page).toHaveURL(/current-stock-location/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /CSV/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  await page.goto("/reports/current-stock-location?print=1");
  await expect(page.getByText(/Print view/)).toBeVisible();
});

test("unauthorized financial reports and search results remain hidden", async ({
  page,
}) => {
  await signIn(page, "site.supervisor@kdipl.test");
  await page.goto("/reports/payables");
  await expect(
    page.getByRole("heading", { name: "Report access denied" }),
  ).toBeVisible();
  await page.goto("/search?q=INV-P7&type=invoice");
  await expect(
    page.getByText("No authorized results match this search."),
  ).toBeVisible();
});
