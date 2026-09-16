import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { PrismaClient } from "../../src/generated/prisma/client";

const testDb = process.env.TEST_DATABASE_URL
  ? new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.TEST_DATABASE_URL,
      }),
    })
  : null;

test.setTimeout(180_000);

async function signIn(page: Page, email: string) {
  const password = process.env.DEMO_BUSINESS_PASSWORD;
  test.skip(
    !password,
    "DEMO_BUSINESS_PASSWORD is required for Phase 7 E2E coverage.",
  );
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function firstRealOption(select: Locator, contains?: string) {
  await expect(select).toBeVisible();
  await expect.poll(() => select.locator("option").count()).toBeGreaterThan(1);
  const value = await select.evaluate((element, search) => {
    const options = Array.from((element as HTMLSelectElement).options);
    return (
      options.find((option) =>
        search ? option.textContent?.includes(search) : !!option.value,
      )?.value ?? null
    );
  }, contains);
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

async function transition(card: Locator, action: string, reason = "") {
  await card.getByLabel("Action").selectOption(action);
  if (reason) await card.getByLabel("Reason").fill(reason);
  await card.getByRole("button", { name: "Apply invoice transition" }).click();
  await expect(card.getByText("Saved successfully.")).toBeVisible();
}

async function createInvoice(
  page: Page,
  supplierInvoiceNumber: string,
  unitPrice = "1000",
) {
  await page.goto("/accounts/invoices/new");
  await expect(
    page.getByRole("heading", { name: "Supplier invoice entry" }),
  ).toBeVisible();
  const form = page
    .locator("section")
    .filter({ hasText: "New supplier invoice draft" })
    .last();
  await firstRealOption(form.locator("select").nth(0), "National Hardware");
  await form
    .getByLabel("Supplier invoice number", { exact: true })
    .fill(supplierInvoiceNumber);
  await form.getByLabel("Invoice date").fill("2026-09-16");
  await form.getByLabel("Place of supply").fill("Haryana");
  await form.getByLabel("Credit terms source").selectOption("PURCHASE_ORDER");
  await firstRealOption(form.getByLabel("Supplier invoice document"));
  await firstRealOption(form.getByLabel("PO item"), "P7DEMO");
  await firstRealOption(form.getByLabel("Posted GRN allocation"), "P7DEMO");
  await form.getByLabel("HSN/SAC").fill("7306");
  await form.getByLabel("Invoiced quantity").fill("1");
  await form.getByLabel("Unit price").fill(unitPrice);
  await form.getByLabel("Remarks").fill(`Playwright ${supplierInvoiceNumber}`);
  await form.getByRole("button", { name: "Save invoice draft" }).click();
  await expect(form.getByText("Saved successfully.")).toBeVisible();
}

function invoiceCard(page: Page, supplierInvoiceNumber: string) {
  return page
    .locator("article")
    .filter({ hasText: supplierInvoiceNumber })
    .first();
}

test.afterAll(async () => testDb?.$disconnect());

test("Accounts and MD complete invoice, payments, reversal, note, and Tally retry", async ({
  page,
}, testInfo) => {
  test.skip(!testDb, "TEST_DATABASE_URL is required for Phase 7 E2E coverage.");
  const suffix = `${testInfo.project.name.startsWith("mobile") ? "M" : "D"}-${Date.now()}`;
  const supplierInvoiceNumber = `E2E-P7-${suffix}`;

  await signIn(page, "accounts@kdipl.test");
  await createInvoice(page, supplierInvoiceNumber);
  await page.goto("/accounts/invoices");
  let card = invoiceCard(page, supplierInvoiceNumber);
  await transition(card, "SUBMIT");
  card = invoiceCard(page, supplierInvoiceNumber);
  await transition(card, "RUN_MATCH");
  card = invoiceCard(page, supplierInvoiceNumber);
  await transition(card, "VERIFY");
  card = invoiceCard(page, supplierInvoiceNumber);
  await transition(card, "REQUEST_APPROVAL");
  card = invoiceCard(page, supplierInvoiceNumber);
  const internalNumber = ((await card.locator("h3").textContent()) ?? "").split(
    " ",
  )[0];
  expect(internalNumber).toMatch(/^INV-26-27-/);

  await signIn(page, "managing.director@kdipl.test");
  await page.goto("/accounts/invoices");
  card = invoiceCard(page, supplierInvoiceNumber);
  await transition(
    card,
    "APPROVE",
    "MD approved the verified supplier invoice",
  );
  await expect(invoiceCard(page, supplierInvoiceNumber)).toContainText(
    "APPROVED",
  );

  await signIn(page, "accounts@kdipl.test");
  await page.goto("/accounts/payments");
  const paymentForm = page
    .locator("section")
    .filter({ hasText: "Prepare supplier payment" })
    .first();
  await firstRealOption(
    paymentForm.getByLabel("Approved invoice"),
    internalNumber,
  );
  await paymentForm.getByLabel("Amount").fill("500");
  await firstRealOption(
    paymentForm.getByLabel("Company bank account"),
    "HDFC Bank",
  );
  await paymentForm.getByLabel("UTR / reference").fill(`UTR-PART-${suffix}`);
  await firstRealOption(paymentForm.getByLabel("Payment proof"));
  await paymentForm
    .getByLabel("Payment reason")
    .fill("First partial supplier payment");
  await paymentForm
    .getByRole("button", { name: "Submit payment for MD approval" })
    .click();
  await expect(paymentForm.getByText("Saved successfully.")).toBeVisible();
  let paymentCard = page
    .locator("article")
    .filter({ hasText: internalNumber })
    .filter({ hasText: "500" })
    .first();
  const partialPaymentNumber = (
    (await paymentCard.locator("h3").textContent()) ?? ""
  ).split(" ")[0];

  await signIn(page, "managing.director@kdipl.test");
  await page.goto("/accounts/payments");
  paymentCard = page
    .locator("article")
    .filter({ hasText: partialPaymentNumber });
  let decisionForm = paymentCard;
  await decisionForm
    .getByLabel("APPROVE reason")
    .fill("MD approved partial payment");
  await decisionForm.getByRole("button", { name: "Approve payment" }).click();
  await expect(
    page.locator("article").filter({ hasText: partialPaymentNumber }),
  ).toContainText("APPROVED");

  await signIn(page, "accounts@kdipl.test");
  await page.goto("/accounts/payments");
  const finalForm = page
    .locator("section")
    .filter({ hasText: "Prepare supplier payment" })
    .first();
  await firstRealOption(
    finalForm.getByLabel("Approved invoice"),
    internalNumber,
  );
  await finalForm.getByLabel("Amount").fill("680");
  await firstRealOption(
    finalForm.getByLabel("Company bank account"),
    "HDFC Bank",
  );
  await finalForm.getByLabel("UTR / reference").fill(`UTR-FINAL-${suffix}`);
  await firstRealOption(finalForm.getByLabel("Payment proof"));
  await finalForm.getByLabel("Payment reason").fill("Final supplier payment");
  await finalForm
    .getByRole("button", { name: "Submit payment for MD approval" })
    .click();
  await expect(finalForm.getByText("Saved successfully.")).toBeVisible();
  paymentCard = page
    .locator("article")
    .filter({ hasText: internalNumber })
    .filter({ hasText: "680" })
    .first();
  const finalPaymentNumber = (
    (await paymentCard.locator("h3").textContent()) ?? ""
  ).split(" ")[0];

  await signIn(page, "managing.director@kdipl.test");
  await page.goto("/accounts/payments");
  paymentCard = page.locator("article").filter({ hasText: finalPaymentNumber });
  decisionForm = paymentCard;
  await decisionForm
    .getByLabel("APPROVE reason")
    .fill("MD approved final payment");
  await decisionForm.getByRole("button", { name: "Approve payment" }).click();
  await expect(
    page.locator("article").filter({ hasText: finalPaymentNumber }),
  ).toContainText("APPROVED");

  await signIn(page, "accounts@kdipl.test");
  await page.goto("/accounts/payments");
  paymentCard = page.locator("article").filter({ hasText: finalPaymentNumber });
  const reversalForm = paymentCard;
  await firstRealOption(reversalForm.getByLabel("Reversal evidence"));
  await reversalForm
    .getByLabel("Reversal reason")
    .fill("Incorrect UTR in final payment");
  await reversalForm
    .getByRole("button", { name: "Submit payment reversal for MD approval" })
    .click();
  await expect(reversalForm.getByText("Saved successfully.")).toBeVisible();
  const reversalCard = page
    .locator("article")
    .filter({ hasText: `Reversal of ${finalPaymentNumber}` });
  const reversalNumber = (
    (await reversalCard.locator("h3").textContent()) ?? ""
  ).split(" ")[0];

  await signIn(page, "managing.director@kdipl.test");
  await page.goto("/accounts/payments");
  paymentCard = page.locator("article").filter({ hasText: reversalNumber });
  decisionForm = paymentCard;
  await decisionForm
    .getByLabel("APPROVE reason")
    .fill("MD approved corrective reversal");
  await decisionForm.getByRole("button", { name: "Approve payment" }).click();
  await expect(
    page.locator("article").filter({ hasText: reversalNumber }),
  ).toContainText("APPROVED");

  await signIn(page, "accounts@kdipl.test");
  await page.goto("/accounts/notes");
  const noteForm = page
    .locator("section")
    .filter({ hasText: "Create credit or debit note" })
    .first();
  await firstRealOption(
    noteForm.getByLabel("Original finalized invoice"),
    internalNumber,
  );
  await firstRealOption(noteForm.getByLabel("Original invoice item"));
  await noteForm.getByLabel("Affected quantity").fill("0.050");
  await noteForm.getByLabel("Taxable value").fill("50");
  await firstRealOption(noteForm.getByLabel("Note document"));
  const noteReason = `Price correction ${suffix}`;
  await noteForm.getByLabel("Note reason").fill(noteReason);
  await noteForm
    .getByRole("button", { name: "Save financial note draft" })
    .click();
  await expect(noteForm.getByText("Saved successfully.")).toBeVisible();
  let noteCard = page.locator("article").filter({ hasText: noteReason });
  const noteNumber = ((await noteCard.locator("h3").textContent()) ?? "").split(
    " ",
  )[0];
  await noteCard
    .getByRole("button", { name: "Submit note for MD approval" })
    .click();
  await expect(
    page.locator("article").filter({ hasText: noteNumber }),
  ).toContainText("PENDING_APPROVAL");

  await signIn(page, "managing.director@kdipl.test");
  await page.goto("/accounts/notes");
  noteCard = page.locator("article").filter({ hasText: noteNumber });
  const noteApproval = noteCard.locator(
    'form:has(button:text-is("Approve note"))',
  );
  await noteApproval
    .getByLabel("Decision reason")
    .fill("MD approved supplier credit note");
  await noteApproval.getByRole("button", { name: "Approve note" }).click();
  await expect(
    page.locator("article").filter({ hasText: noteNumber }),
  ).toContainText("APPROVED");

  const invoice = await testDb!.supplierInvoice.findUniqueOrThrow({
    where: { internalNumber },
  });
  const tallyEvent = await testDb!.tallyExportEvent.findFirstOrThrow({
    where: { entityType: "SUPPLIER_INVOICE", entityId: invoice.id },
  });
  await testDb!.tallyExportEvent.update({
    where: { id: tallyEvent.id },
    data: { status: "FAILED", lastError: "E2E simulated transport failure" },
  });
  await signIn(page, "accounts@kdipl.test");
  await page.goto("/accounts/tally");
  const tallyCard = page
    .locator("article")
    .filter({ hasText: tallyEvent.exportNumber });
  await expect(tallyCard).toContainText("FAILED");
  await tallyCard.getByRole("button", { name: "Retry XML export" }).click();
  await expect(
    page.locator("article").filter({ hasText: tallyEvent.exportNumber }),
  ).toContainText("EXPORTED");
});

test("Accounts resolve invoice mismatches while unauthorized roles remain denied", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name.startsWith("mobile") ? "M" : "D"}-MM-${Date.now()}`;
  const supplierInvoiceNumber = `E2E-P7-${suffix}`;
  await signIn(page, "accounts@kdipl.test");
  await createInvoice(page, supplierInvoiceNumber, "1001");
  await page.goto("/accounts/invoices");
  let card = invoiceCard(page, supplierInvoiceNumber);
  await transition(card, "SUBMIT");
  card = invoiceCard(page, supplierInvoiceNumber);
  await transition(card, "RUN_MATCH");
  card = invoiceCard(page, supplierInvoiceNumber);
  await expect(card).toContainText("DISPUTED");
  while (
    (await card.getByRole("button", { name: /Accept .* mismatch/ }).count()) > 0
  ) {
    const button = card
      .getByRole("button", { name: /Accept .* mismatch/ })
      .first();
    await button.click();
    await expect(card.getByText("Saved successfully.").first()).toBeVisible();
  }
  await transition(
    card,
    "RESUBMIT",
    "Accounts reviewed every supplier variance",
  );
  card = invoiceCard(page, supplierInvoiceNumber);
  await transition(card, "RUN_MATCH");
  await expect(invoiceCard(page, supplierInvoiceNumber)).toContainText(
    "MATCHED",
  );

  await signIn(page, "project.manager@kdipl.test");
  await page.goto("/accounts");
  await expect(
    page.getByRole("heading", { name: "Accounts access required" }),
  ).toBeVisible();
});
