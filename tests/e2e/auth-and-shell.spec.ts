import { expect, test } from "@playwright/test";

test("protected routes redirect to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("bootstrap administrator can sign in and use the responsive shell", async ({
  page,
}, testInfo) => {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  test.skip(
    !email || !password,
    "Bootstrap credentials are required for authenticated E2E coverage.",
  );
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Good day/ })).toBeVisible();
  if (testInfo.project.name.startsWith("desktop")) {
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeVisible();
  }
  await page.locator('header button[aria-haspopup="menu"]').last().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
