import { expect, test } from "@playwright/test";

async function signInAsBootstrapAdministrator(
  page: import("@playwright/test").Page,
) {
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
}

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
  await signInAsBootstrapAdministrator(page);
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
  await expect(page.getByRole("link", { name: /DLF Residence/ })).toBeVisible();
  await page.getByRole("link", { name: /DLF Residence/ }).click();
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

test("administrator can create a Phase 3 material requirement draft", async ({
  page,
}, testInfo) => {
  await signInAsBootstrapAdministrator(page);
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
  await expect(page.getByText(/No workflow action is available/)).toBeVisible();
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
  await employeeForm.getByLabel("Employee code").fill(employeeCode);
  await employeeForm.getByLabel("Full name").fill(employeeName);
  await employeeForm.getByLabel("Work email").fill(email);
  await employeeForm.getByRole("button", { name: "Add employee" }).click();
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
