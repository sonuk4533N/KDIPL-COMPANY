import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const url = process.env.TEST_DATABASE_URL;
const pool = url
  ? new Pool({ connectionString: url, max: 1, allowExitOnIdle: true })
  : null;
const client = url ? new PrismaClient({ adapter: new PrismaPg(pool!) }) : null;
test.skip(
  !client || !process.env.DEMO_BUSINESS_PASSWORD,
  "Seeded test database and business credentials required.",
);

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_BUSINESS_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/inventory/movements");
  await expect(
    page.getByRole("heading", {
      name: "Stock movements & project closure",
      exact: true,
    }),
  ).toBeVisible();
}
async function logout(page: Page) {
  await page.locator('header button[aria-haspopup="menu"]').last().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
async function fixture() {
  const tag = randomUUID().slice(0, 8);
  const supervisor = await client!.user.findUniqueOrThrow({
    where: { emailNormalized: "site.supervisor@kdipl.test" },
  });
  const customer = await client!.client.findFirstOrThrow();
  const project = await client!.project.create({
    data: {
      projectCode: `E2E-P6-${tag}`,
      name: `E2E closure ${tag}`,
      clientId: customer.id,
      location: "Test",
      status: "ACTIVE",
    },
  });
  const site = await client!.site.create({
    data: {
      projectId: project.id,
      siteCode: `E2E-${tag}`,
      name: `E2E site ${tag}`,
      location: "Test",
      status: "ACTIVE",
      assignments: {
        create: { employeeId: supervisor.employeeId!, role: "SITE_SUPERVISOR" },
      },
    },
  });
  const source = await client!.inventoryLocation.create({
    data: {
      locationCode: `E2E-C-${tag}`,
      name: `E2E central ${tag}`,
      type: "CENTRAL_STORE",
    },
  });
  const destination = await client!.inventoryLocation.create({
    data: {
      locationCode: `E2E-S-${tag}`,
      name: `E2E site store ${tag}`,
      type: "SITE_STORE",
      projectId: project.id,
      siteId: site.id,
    },
  });
  const material = await client!.material.findFirstOrThrow();
  return { tag, source, destination, material, project };
}
test("assigned supervisor must capture GPS before requesting material", async ({
  page,
  context,
}) => {
  const f = await fixture();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 28.45, longitude: 77.04 });
  await login(page, "site.supervisor@kdipl.test");
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create request", exact: true }),
  });
  await form.getByLabel("Movement type").selectOption("ISSUE");
  await form.getByLabel("Source location").selectOption(f.source.id);
  await form
    .getByLabel("Destination", { exact: true })
    .selectOption(f.destination.id);
  await form
    .getByLabel("Material", { exact: true })
    .selectOption(f.material.id);
  await form.getByLabel("Requested quantity").fill("3.5");
  await form.getByLabel("Reason", { exact: true }).fill(`GPS request ${f.tag}`);
  await form
    .getByRole("button", { name: "Create request", exact: true })
    .click();
  await expect(
    form.getByRole("status").filter({ hasText: "GPS is mandatory" }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Capture GPS" }).click();
  await expect(form.getByText("GPS captured.", { exact: true })).toBeVisible();
  // React resets uncontrolled form fields after a completed Server Action,
  // including validation responses, so restore the request before retrying.
  await form.getByLabel("Source location").selectOption(f.source.id);
  await form
    .getByLabel("Destination", { exact: true })
    .selectOption(f.destination.id);
  await form
    .getByLabel("Material", { exact: true })
    .selectOption(f.material.id);
  await form.getByLabel("Requested quantity").fill("3.5");
  await form.getByLabel("Reason", { exact: true }).fill(`GPS request ${f.tag}`);
  await form
    .getByRole("button", { name: "Create request", exact: true })
    .click();
  await expect(
    form.getByText("Saved successfully.", { exact: true }),
  ).toBeVisible();
  const record = page
    .locator("article")
    .filter({ hasText: `GPS request ${f.tag}` });
  await expect(record.getByRole("heading")).toContainText(/MI-\d{2}-\d{2}-\d+/);
  await expect(record).toContainText("REQUESTED");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
});

test("transfer approval belongs to Project Director; dispatch cannot invent stock", async ({
  page,
}) => {
  const f = await fixture();
  await login(page, "store.keeper@kdipl.test");
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create request", exact: true }),
  });
  await form.getByLabel("Movement type").selectOption("TRANSFER");
  await form.getByLabel("Source location").selectOption(f.source.id);
  await form
    .getByLabel("Destination", { exact: true })
    .selectOption(f.destination.id);
  await form
    .getByLabel("Material", { exact: true })
    .selectOption(f.material.id);
  await form.getByLabel("Requested quantity").fill("2");
  await form
    .getByLabel("Reason", { exact: true })
    .fill(`Transfer approval ${f.tag}`);
  await form.getByRole("button", { name: "Create request" }).click();
  await expect(
    form.getByText("Saved successfully.", { exact: true }),
  ).toBeVisible();
  await logout(page);
  await login(page, "project.director@kdipl.test");
  const record = page
    .locator("article")
    .filter({ hasText: `Transfer approval ${f.tag}` });
  await record.getByText("Available actions", { exact: true }).click();
  await record.getByLabel("Action", { exact: true }).selectOption("APPROVE");
  await record
    .getByLabel("Reason", { exact: true })
    .fill("Director approves destination and quantity");
  await record.getByRole("button", { name: "Apply transition" }).click();
  await expect(record.getByRole("heading")).toContainText("APPROVED");
  await logout(page);
  await login(page, "store.keeper@kdipl.test");
  await record.getByText("Available actions", { exact: true }).click();
  await record.getByLabel("Action", { exact: true }).selectOption("DISPATCH");
  await record
    .getByLabel("Reason", { exact: true })
    .fill("Attempt physical dispatch");
  await record.getByRole("button", { name: "Apply transition" }).click();
  await expect(
    record
      .getByRole("status")
      .filter({ hasText: "Insufficient unreserved stock" }),
  ).toBeVisible();
  await expect(record.getByRole("heading")).toContainText("APPROVED");
});

test("retained evidence supports closure counts verified by Accounts without posting stock", async ({
  page,
}) => {
  const f = await fixture();
  await login(page, "project.director@kdipl.test");
  const closureForm = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Start / refresh Central Store transfers",
      exact: true,
    }),
  });
  await closureForm
    .getByLabel("Project", { exact: true })
    .selectOption(f.project.id);
  await closureForm
    .getByLabel("Central Store", { exact: true })
    .selectOption(f.source.id);
  await closureForm
    .getByLabel("Reason", { exact: true })
    .fill("Begin project close inventory count");
  await closureForm.getByRole("button").click();
  await expect(closureForm.getByText("Saved successfully.")).toBeVisible();
  await logout(page);
  await login(page, "store.keeper@kdipl.test");
  const upload = page.locator("form").filter({
    has: page.getByRole("button", { name: "Upload and scan", exact: true }),
  });
  const filename = `count-${f.tag}.pdf`;
  await upload.getByLabel("Evidence file").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nPhysical count evidence\n%%EOF"),
  });
  await upload
    .getByRole("button", { name: "Upload and scan", exact: true })
    .click();
  await expect(
    upload.getByText("Saved successfully.", { exact: true }),
  ).toBeVisible();
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create request", exact: true }),
  });
  await form.getByLabel("Movement type").selectOption("COUNT");
  await form.getByLabel("Source location").selectOption(f.destination.id);
  await form
    .getByLabel("Material", { exact: true })
    .selectOption(f.material.id);
  await form.getByLabel("Physically counted quantity").fill("0");
  await form
    .getByLabel("Reason", { exact: true })
    .fill(`Closure count ${f.tag}`);
  await form.getByLabel("Retained evidence").selectOption({ label: filename });
  await form.getByRole("button", { name: "Create request" }).click();
  await expect(
    form.getByText("Saved successfully.", { exact: true }),
  ).toBeVisible();
  await logout(page);
  await login(page, "accounts@kdipl.test");
  const record = page
    .locator("article")
    .filter({ hasText: `Closure count ${f.tag}` });
  const download = page.waitForEvent("download");
  await record
    .getByRole("link", { name: "Download retained evidence" })
    .click();
  expect((await download).suggestedFilename()).toBe(filename);
  await record.getByText("Available actions", { exact: true }).click();
  await record
    .getByLabel("Action", { exact: true })
    .selectOption("VERIFY_COUNT");
  await record
    .getByLabel("Reason", { exact: true })
    .fill("Accounts independently verified zero physical stock");
  await record.getByRole("button", { name: "Apply transition" }).click();
  await expect(record.getByRole("heading")).toContainText("VERIFIED");
});

test("MD has approval visibility but no Store Keeper preparation controls", async ({
  page,
}) => {
  await login(page, "managing.director@kdipl.test");
  await expect(
    page.getByRole("heading", { name: "Movement register", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create request", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Upload and scan", exact: true }),
  ).toHaveCount(0);
});
