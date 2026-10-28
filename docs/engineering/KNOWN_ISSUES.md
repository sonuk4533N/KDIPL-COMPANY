# Known Issues & Defect Tracking

This document tracks verified defects, reproduction steps, root causes, severity, and current status according to the AntiGravity Master Engineering Directive.

---

### ISSUE-01: Playwright E2E Test Suite Stalls on 2FA TOTP Prompt
* **Severity**: High (blocks automated E2E test execution in CI/CD and local test suite)
* **Status**: Confirmed Defect in Test Automation Suite
* **Affected Files**: `tests/e2e/auth-and-shell.spec.ts`, `tests/e2e/business-role-access.spec.ts`
* **Reproduction Steps**:
  1. Ensure dev server is running on `http://localhost:3000`.
  2. Execute `npx playwright test tests/e2e/auth-and-shell.spec.ts --project=desktop-chromium`.
  3. Observe tests 3 through 9 timeout with `expect(page).toHaveURL(/\/dashboard$/)`.
* **Evidence**:
  * Playwright trace and `error-context.md` snapshot confirm that the login form transitions to the Phase 10 Two-Factor Verification screen (`text: Two-Factor Verification`, `textbox: "6-Digit Verification Code or Recovery Code"`, placeholder `e.g. 123456 or kdipl-master-pass`).
  * Test helper `signInAsBootstrapAdministrator` and `signInAsProjectManager` only fill Work Email and Password, and wait for `/dashboard` directly without providing TOTP or recovery code.
* **Root Cause**: The test login helpers were written before Phase 10 2FA enforcement. The backend correctly enforces 2FA for administrative and privileged business roles.
* **Proposed Remediation**: Update E2E test login helpers to detect the 2FA challenge and input the configured test TOTP / recovery code (`kdipl-master-pass` or TOTP generation helper) to complete the session challenge cleanly.

---

### ISSUE-02: E2E Security Headers Test Fails When Reusing Development Server
* **Severity**: Low (Test Harness / Environment Mismatch)
* **Status**: Confirmed Environment Behavior
* **Affected Files**: `tests/e2e/auth-and-shell.spec.ts`, `next.config.ts`, `playwright.config.ts`
* **Reproduction Steps**:
  1. Start `next dev` on port 3000.
  2. Run `npx playwright test tests/e2e/auth-and-shell.spec.ts -g "security headers"`.
* **Evidence**:
  * `expect(headers["strict-transport-security"]).toContain("max-age=31536000")` receives `undefined`.
  * `next.config.ts` lines 24–31 explicitly omit `Strict-Transport-Security` when `NODE_ENV === "development"` to protect local HTTP browsing.
  * `playwright.config.ts` line 36 sets `reuseExistingServer: !process.env.CI`. When a local dev server is running, Playwright reuses the dev server (`NODE_ENV === "development"`), where HSTS is omitted by design.
* **Root Cause**: The test explicitly checks for production response headers (`test("production responses enforce browser security headers")`), but the test runner reuses a development server.
* **Proposed Remediation**: Configure Playwright to either run security header assertions only when running against a production build server (`next start`), or check `NODE_ENV` conditionally.

---

### ISSUE-03: Staged Changes in `dashboard-service.ts` Introduce Hardcoded Metric Values
* **Severity**: Medium (Code Quality / Zero-Guessing Policy)
* **Status**: Staged in Git Index (Uncommitted)
* **Affected Files**: `src/server/intelligence/dashboard-service.ts`
* **Evidence**:
  * `git diff --staged src/server/intelligence/dashboard-service.ts` reveals hardcoded values (e.g. `currencyFormatter.format(3450000)`, `currencyFormatter.format(18900000)`, `"94.6%"`, `"3 SKUs"`) replacing live Prisma aggregate queries (`suppliersCount`, `committedPoAmount`, `locationsCount`, `pendingGrnsCount`).
* **Root Cause**: Prior workspace modifications staged placeholder numbers instead of preserving or fixing live database aggregations.
* **Proposed Remediation**: Unstage and restore live database queries, ensuring real metrics are computed from Prisma models.

---

### ISSUE-04: Integration Test Suite Skipped Without Isolated Test Database
* **Severity**: Low (Test Harness Configuration)
* **Status**: Verified by Design
* **Affected Files**: `tests/integration/*.test.ts`
* **Evidence**:
  * `npm run test:integration` outputs `12 skipped (56 tests skipped)`.
  * Integration tests contain `const enabled = process.env.RUN_DATABASE_TESTS === "1" && !!process.env.TEST_DATABASE_URL`.
* **Root Cause**: Safety guard to prevent integration tests from mutating the primary database unless an isolated `TEST_DATABASE_URL` is explicitly provided.
