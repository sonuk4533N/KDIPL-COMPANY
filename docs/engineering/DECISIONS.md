# Engineering Decisions & Decision Requests

This document logs architectural and engineering decisions according to the AntiGravity Master Engineering Directive approval protocol.

---

### DEC-001: Playwright E2E 2FA Handling in Test Automation
* **Status**: PROPOSED (Awaiting User Approval)
* **Problem**: Playwright E2E tests in `tests/e2e/auth-and-shell.spec.ts` and `business-role-access.spec.ts` fail because Phase 10 introduced Two-Factor Authentication (2FA) for administrators and privileged business roles. The test helpers `signInAsBootstrapAdministrator` and `signInAsProjectManager` only enter username and password, then stall on the 2FA challenge screen.
* **Evidence**:
  * Playwright trace shows the login page correctly advances to `Two-Factor Verification` with `textbox "6-Digit Verification Code or Recovery Code"`.
  * `tests/unit/two-factor.test.ts` validates that 2FA is active on all privileged business roles.
* **Options**:
  * **Option 1 (Recommended)**: Update test login helpers in `tests/e2e/*.spec.ts` to detect the 2FA challenge and input the test emergency recovery code (`kdipl-master-pass`) or compute the TOTP code using the shared test secret. This tests the real authentic user journey without compromising application security.
  * **Option 2**: Add an environment variable or header to bypass 2FA when running Playwright.
* **Recommendation**: Option 1. It preserves security posture, avoids introducing test backdoors into production code, and verifies the full 2FA journey.
* **Risks**: None. Modifies only test helper code in `tests/e2e/`.
* **Files Affected**: `tests/e2e/auth-and-shell.spec.ts`, `tests/e2e/business-role-access.spec.ts`
* **Verification Plan**: Run `npx playwright test tests/e2e/auth-and-shell.spec.ts` and verify all tests pass.
* **Approval Required**: Authorize updating the Playwright E2E test helpers to support 2FA submission.

---

### DEC-002: Reversion of Staged Hardcoded Values in `dashboard-service.ts`
* **Status**: PROPOSED (Awaiting User Approval)
* **Problem**: `git diff --staged src/server/intelligence/dashboard-service.ts` contains hardcoded mock values (e.g. `currencyFormatter.format(3450000)`, `"94.6%"`, `"3 SKUs"`) that replaced live Prisma database aggregation queries. This violates the Master Directive's zero-guessing and anti-mocking policy.
* **Evidence**: Line 488, 516, 577, 617 of `src/server/intelligence/dashboard-service.ts`.
* **Options**:
  * **Option 1 (Recommended)**: Unstage and revert the hardcoded values in `dashboard-service.ts`, keeping the genuine database queries (`suppliersCount`, `committedPoAmount`, `locationsCount`, `pendingGrnsCount`) and calculating any missing metrics from Prisma models.
  * **Option 2**: Keep the staged changes as a temporary presentation override.
* **Recommendation**: Option 1. Adheres strictly to the directive's rule: *"Do not introduce hardcoded responses that imitate real behavior."*
* **Risks**: Low. Only affects dashboard card metrics display.
* **Files Affected**: `src/server/intelligence/dashboard-service.ts`
* **Verification Plan**: Run `npm run test:unit tests/unit/phase12-intelligence.test.ts` and inspect `/dashboard` in browser.
* **Approval Required**: Authorize reverting the hardcoded staged changes in `dashboard-service.ts`.

---

### DEC-003: Dedicated Integration Test Database Provisioning
* **Status**: PROPOSED (Awaiting User Approval)
* **Problem**: Integration tests (`tests/integration/*.test.ts`) require an isolated PostgreSQL test database (`TEST_DATABASE_URL`) with `RUN_DATABASE_TESTS=1`. Currently, all 12 integration test files (56 tests) are skipped to prevent overwriting local development data.
* **Evidence**: `vitest run tests/integration` returns `12 skipped (56 skipped)`.
* **Options**:
  * **Option 1 (Recommended)**: Create an isolated PostgreSQL database `kdipl_test` on the running PostgreSQL server (`localhost:5432`), apply Prisma migrations, and run `npm run test:integration` safely against it.
  * **Option 2**: Defer integration tests until a dedicated CI environment is spun up.
* **Recommendation**: Option 1. Allows TC-15 verification without any risk to development or production databases.
* **Risks**: Low. Creates a separate schema/database `kdipl_test` without altering `kdipl`.
* **Files Affected**: `.env` (adding `TEST_DATABASE_URL="postgresql://kdipl:kdipl_dev@localhost:5432/kdipl_test?schema=public"`), local PostgreSQL server.
* **Verification Plan**: Run `npm run test:integration` and confirm all 56 integration tests execute and pass.
* **Approval Required**: Authorize creating the local `kdipl_test` database and configuring `TEST_DATABASE_URL`.
