import { expect, test } from "@playwright/test";
import { generateTotpCode } from "../../src/server/auth/totp";

function resolveTotpCode(email: string): string {
  const envSecret =
    process.env.TEST_2FA_SECRET ??
    (email === process.env.BOOTSTRAP_ADMIN_EMAIL
      ? process.env.BOOTSTRAP_ADMIN_2FA_SECRET
      : process.env.DEMO_BUSINESS_2FA_SECRET);

  if (!envSecret) {
    throw new Error(
      `Dedicated test-only 2FA secret is not configured for ${email}. Set TEST_2FA_SECRET, BOOTSTRAP_ADMIN_2FA_SECRET, or DEMO_BUSINESS_2FA_SECRET in the test environment.`,
    );
  }

  return generateTotpCode(envSecret);
}

async function handleTwoFactorIfChallenged(
  page: import("@playwright/test").Page,
  email: string,
) {
  if (page.url().includes("/dashboard")) {
    return;
  }

  const twoFactorInput = page.locator('input#code, input[name="code"]');
  const isChallenged = await Promise.race([
    twoFactorInput
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false),
    page
      .waitForURL(/\/dashboard$/, { timeout: 8000 })
      .then(() => false)
      .catch(() => false),
  ]);

  if (isChallenged && !page.url().includes("/dashboard")) {
    const totpCode = await resolveTotpCode(email);
    await twoFactorInput.fill(totpCode);
    await page.getByRole("button", { name: "Verify & Sign in" }).click();
  }

  await expect(page).toHaveURL(/\/dashboard$/);
}

const businessAccounts = [
  {
    role: "Project Director",
    email: "project.director@kdipl.test",
    route: "/procurement",
    heading: "Procurement sourcing",
    allowedNavigation: "Procurement",
    deniedNavigation: "Administration",
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
  const secret =
    process.env.TEST_2FA_SECRET ?? process.env.DEMO_BUSINESS_2FA_SECRET;
  test.skip(
    !password || !secret,
    "DEMO_BUSINESS_PASSWORD and dedicated test 2FA secret are required for business-role E2E coverage.",
  );

  for (const account of businessAccounts) {
    await test.step(account.role, async () => {
      await page.goto("/login");
      await page.getByLabel("Work email").fill(account.email);
      await page.getByLabel("Password").fill(password!);
      await page.getByRole("button", { name: "Sign in securely" }).click();
      await handleTwoFactorIfChallenged(page, account.email);

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
              : !testInfo.project.name.startsWith("desktop") &&
                  account.route === "/requirements"
                ? "Request"
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
