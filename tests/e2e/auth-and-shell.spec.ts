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

async function signInAsBootstrapAdministrator(
  page: import("@playwright/test").Page,
) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const secret =
    process.env.TEST_2FA_SECRET ?? process.env.BOOTSTRAP_ADMIN_2FA_SECRET;
  test.skip(
    !email || !password || !secret,
    "Bootstrap credentials and dedicated test 2FA secret are required for authenticated E2E coverage.",
  );
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await handleTwoFactorIfChallenged(page, email!);
}

async function signInAsProjectManager(page: import("@playwright/test").Page) {
  const password = process.env.DEMO_BUSINESS_PASSWORD;
  const secret =
    process.env.TEST_2FA_SECRET ?? process.env.DEMO_BUSINESS_2FA_SECRET;
  test.skip(
    !password || !secret,
    "DEMO_BUSINESS_PASSWORD and dedicated test 2FA secret are required for business-role E2E coverage.",
  );
  await page.goto("/login");
  await page.getByLabel("Work email").fill("project.manager@kdipl.test");
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await handleTwoFactorIfChallenged(page, "project.manager@kdipl.test");
}

test("protected routes redirect to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("production responses enforce browser security headers", async ({
  request,
}) => {
  const response = await request.get("/login");
  const headers = response.headers();

  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("payment=()");
});

test("bootstrap administrator can sign in and use the responsive shell", async ({
  page,
}, testInfo) => {
  await signInAsBootstrapAdministrator(page);
  await expect(page.getByRole("heading", { name: /Good day/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create" })).toHaveCount(0);
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

test("administrator can access Phase 1 identity and account security surfaces", async ({
  page,
}) => {
  await signInAsBootstrapAdministrator(page);
  await page.goto("/administration");
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "Administration", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create login account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add employee" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Roles & permissions" }),
  ).toBeVisible();
  await page.goto("/account/security");
  await expect(
    page.getByRole("heading", { name: "Security & sessions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Login activity" }),
  ).toBeVisible();
});

test("administrator can browse the Phase 2 project and master-data foundation", async ({
  page,
}) => {
  await signInAsBootstrapAdministrator(page);

  await page.goto("/projects");
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "Projects", exact: true }),
  ).toBeVisible();
  const seededProjectLink = page.getByRole("link", {
    name: /PRJ-DLF-001.*DLF Residence/,
  });
  await expect(seededProjectLink).toBeVisible();
  await seededProjectLink.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-fA-F-]+$/);
  await expect(
    page.getByRole("heading", { name: "DLF Residence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Assigned sites" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Project team" }),
  ).toBeVisible();

  await page.goto("/master-data");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Master data" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
  await page
    .getByRole("link", { name: "ABC Building Materials Pvt. Ltd." })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "ABC Building Materials Pvt. Ltd." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Organization profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Primary contacts" }),
  ).toBeVisible();
});

test("administrator can open the Phase 4 commercial sourcing workspace", async ({
  page,
}) => {
  await signInAsBootstrapAdministrator(page);
  await page.goto("/procurement");
  await expect(
    page.getByRole("heading", { name: "Procurement sourcing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Controlled commercial and receiving boundary"),
  ).toBeVisible();
  await expect(
    page.getByText(/Purchase Managers source and issue POs/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Purchase order register" }),
  ).toBeVisible();
});

test("administrator can inspect the Phase 5 inventory ledger workspace", async ({
  page,
}) => {
  await signInAsBootstrapAdministrator(page);
  await page.goto("/inventory");
  await expect(
    page.getByRole("heading", { name: "Inventory and receiving", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Goods receipt register" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Damaged and rejected material" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Stock transaction ledger" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Current stock" }),
  ).toBeVisible();
});

test("Project Manager can create a Phase 3 material requirement draft", async ({
  page,
}, testInfo) => {
  await signInAsProjectManager(page);
  await page.goto("/requirements");
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "Material requirements", exact: true }),
  ).toBeVisible();

  const suffix = `${testInfo.project.name.startsWith("mobile") ? "M" : "D"}${Date.now()}`;
  const purpose = `E2E electrical requirement ${suffix}`;
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create draft" }),
  });
  await form
    .getByLabel("Project")
    .selectOption({ label: "DLF Residence · PRJ-DLF-001" });
  await form.getByLabel("Site").selectOption({ label: "Floor 3 · FLOOR-03" });
  await form.getByLabel("Needed by").fill("2026-10-15");
  await form.getByLabel("Purpose").fill(purpose);
  await form
    .getByLabel("Material 1")
    .selectOption({ label: "PVC Conduit 25mm · MAT-PVC-25MM · m" });
  await form.getByLabel(/Quantity/).fill("25.500");
  await form.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: purpose })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Approval workflow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit for approval" }),
  ).toBeVisible();
});

test("administrator can provision an employee with forced temporary-password replacement", async ({
  page,
}, testInfo) => {
  await signInAsBootstrapAdministrator(page);
  await page.goto("/administration");
  const suffix = `${testInfo.project.name.startsWith("mobile") ? "M" : "D"}${Date.now()}`;
  const employeeCode = `E2E-${suffix}`;
  const employeeName = `Phase One ${suffix}`;
  const email = `phase1-${suffix.toLowerCase()}@kdipl.test`;
  const temporaryPassword = `Temporary!${suffix}Aa1`;
  const privatePassword = `Private!${suffix}Bb2`;

  const employeeForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Add employee" }),
  });
  const employeeCodeInput = employeeForm.getByLabel("Employee code");
  const fullNameInput = employeeForm.getByLabel("Full name");
  const emailInput = employeeForm.getByLabel("Work email");
  const addEmployeeButton = employeeForm.getByRole("button", {
    name: "Add employee",
  });

  await expect(employeeForm).toBeVisible();
  await expect(addEmployeeButton).toBeVisible();

  await employeeCodeInput.fill(employeeCode);
  await fullNameInput.fill(employeeName);
  await emailInput.fill(email);

  if ((await employeeCodeInput.inputValue()) !== employeeCode) {
    await employeeCodeInput.fill(employeeCode);
  }

  await expect(employeeCodeInput).toHaveValue(employeeCode);
  await expect(fullNameInput).toHaveValue(employeeName);
  await expect(emailInput).toHaveValue(email);

  await addEmployeeButton.click();
  await expect(page.getByText("Employee created.")).toBeVisible();

  const accountForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create login account" }),
  });
  await accountForm
    .getByLabel("Employee")
    .selectOption({ label: `${employeeName} · ${employeeCode}` });
  await accountForm.getByLabel("Work email").fill(email);
  await accountForm.getByLabel("Temporary password").fill(temporaryPassword);
  await accountForm.getByLabel("System Administrator").check();
  await accountForm
    .getByRole("button", { name: "Create login account" })
    .click();
  await expect(page.getByText("Login account created.")).toBeVisible();

  await page.locator('header button[aria-haspopup="menu"]').last().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(temporaryPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Current password").fill(temporaryPassword);
  await page.getByLabel("New password", { exact: true }).fill(privatePassword);
  await page.getByLabel("Confirm new password").fill(privatePassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
