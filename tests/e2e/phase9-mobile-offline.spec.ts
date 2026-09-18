import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "site.supervisor@kdipl.test") {
  const password = process.env.DEMO_BUSINESS_PASSWORD;
  test.skip(
    !password,
    "DEMO_BUSINESS_PASSWORD is required for Phase 9 E2E coverage.",
  );
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openCapture(page: Page) {
  await page.goto("/mobile");
  await expect(
    page.getByRole("heading", { name: "Offline capture and synchronization" }),
  ).toBeVisible();
  await expect(page.getByLabel("Workflow")).toBeVisible();
  await expect(page.getByLabel("Assigned project")).toBeVisible();
  await expect(
    page.getByLabel("Assigned project").locator("option"),
  ).not.toHaveCount(1);
}

test("creates an encrypted draft offline, locks after a new tab, and reopens after online authentication", async ({
  page,
  context,
}) => {
  await signIn(page);
  await openCapture(page);
  await page.getByLabel("Assigned project").selectOption({ index: 1 });
  await page.getByLabel("Assigned site").selectOption({ index: 1 });
  await page.getByLabel("Material").selectOption({ index: 1 });
  await page.getByLabel("Quantity").fill("12.500");
  await page.getByLabel("Remarks").fill("Offline Phase 9 site requirement");

  await context.setOffline(true);
  await expect(page.getByText("Offline mode", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save encrypted draft" }).click();
  await expect(page.getByText("Encrypted local draft saved.")).toBeVisible();
  await expect(page.getByText("Material Requirement").last()).toBeVisible();

  const reopened = await context.newPage();
  await reopened.goto("/mobile");
  await expect(
    reopened.getByRole("heading", { name: "Connection unavailable" }),
  ).toBeVisible();
  await context.setOffline(false);
  await reopened.goto("/mobile");
  await expect(
    reopened.getByRole("heading", {
      name: "Offline capture and synchronization",
    }),
  ).toBeVisible();
  await expect(
    reopened.getByText("Offline Phase 9 site requirement"),
  ).toHaveCount(0);
  await expect(reopened.getByText("Material Requirement").last()).toBeVisible();
});

test("queues and synchronizes a draft idempotently after reconnect", async ({
  page,
  context,
}) => {
  await signIn(page);
  await openCapture(page);
  await page.getByLabel("Assigned project").selectOption({ index: 1 });
  await page.getByLabel("Assigned site").selectOption({ index: 1 });
  await page.getByLabel("Material").selectOption({ index: 1 });
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("Remarks").fill("Reconnect synchronization test");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Queue for reconnect" }).click();
  await expect(
    page.getByText("Draft queued for synchronization."),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("SYNCED", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("SYNCED", { exact: true })).toBeVisible();
});

test("handles denied GPS and camera-file fallback without horizontal overflow", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure: PositionErrorCallback,
        ) =>
          failure({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError),
      },
    });
  });
  await signIn(page);
  await openCapture(page);
  await page.getByLabel("Workflow").selectOption("SITE_MATERIAL_ISSUE_REQUEST");
  await page.getByRole("button", { name: "Capture GPS" }).click();
  await expect(page.getByText(/Location permission was denied/)).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "site-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByText("site-photo.jpg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate" })).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(
    page.getByRole("button", { name: "Save encrypted draft" }),
  ).toHaveCSS("min-height", "44px");
});
