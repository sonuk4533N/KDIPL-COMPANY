import { expect, test } from "@playwright/test";

const businessAccounts = [
  {
    role: "Project Director",
    email: "project.director@kdipl.test",
    route: "/procurement",
    heading: "Procurement sourcing",
    allowedNavigation: "Procurement",
    deniedNavigation: "Inventory",
  },
  {
    role: "Project Manager",
    email: "project.manager@kdipl.test",
    route: "/requirements",
    heading: "Material requirements",
    allowedNavigation: "Requirements",
    deniedNavigation: "Procurement",
  },
  {
    role: "Purchase Manager",
    email: "purchase.manager@kdipl.test",
    route: "/procurement",
    heading: "Procurement sourcing",
    allowedNavigation: "Procurement",
    deniedNavigation: "Inventory",
  },
  {
    role: "Site Supervisor",
    email: "site.supervisor@kdipl.test",
    route: "/inventory",
    heading: "Inventory and receiving",
    allowedNavigation: "Inventory",
    deniedNavigation: "Procurement",
  },
  {
    role: "Store Keeper",
    email: "store.keeper@kdipl.test",
    route: "/inventory",
    heading: "Inventory and receiving",
    allowedNavigation: "Inventory",
    deniedNavigation: "Procurement",
  },
] as const;

test("business accounts receive only their role-appropriate application access", async ({
  page,
}, testInfo) => {
  const password = process.env.DEMO_BUSINESS_PASSWORD;
  test.skip(
    !password,
    "DEMO_BUSINESS_PASSWORD is required for business-role E2E coverage.",
  );

  for (const account of businessAccounts) {
    await test.step(account.role, async () => {
      await page.goto("/login");
      await page.getByLabel("Work email").fill(account.email);
      await page.getByLabel("Password").fill(password!);
      await page.getByRole("button", { name: "Sign in securely" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto(account.route);
      await expect(
        page.getByRole("main").getByRole("heading", {
          name: account.heading,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Administration" }),
      ).toHaveCount(0);

      const navigation = page.getByRole("navigation", {
        name: testInfo.project.name.startsWith("desktop")
          ? "Primary navigation"
          : "Mobile navigation",
      });
      await expect(navigation).toBeVisible();
      await expect(
        navigation.getByRole("link", {
          name:
            !testInfo.project.name.startsWith("desktop") &&
            account.route === "/inventory"
              ? "Stock"
              : account.allowedNavigation,
        }),
      ).toBeVisible();
      await expect(
        navigation.getByRole("link", { name: account.deniedNavigation }),
      ).toHaveCount(0);

      await page.goto("/administration");
      await expect(
        page.getByRole("heading", { name: "Administration access required" }),
      ).toBeVisible();

      await page.locator('header button[aria-haspopup="menu"]').last().click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});
