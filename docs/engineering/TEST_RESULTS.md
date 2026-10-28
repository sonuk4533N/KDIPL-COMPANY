# Baseline Test Execution Results

**Date**: 2026-10-28  
**Environment**: Windows 11, Node.js v22.16.0, PostgreSQL 18 (WSL2), Next.js 16.3.5

---

## Baseline Execution Summary

| Check / Suite | Command | Exit Code | Result | Details / Evidence |
| :--- | :--- | :---: | :---: | :--- |
| **TypeScript Typecheck** | `npm run typecheck` | 0 | **PASS** | `tsc --noEmit` completed with zero type errors. |
| **ESLint Check** | `npm run lint` | 0 | **PASS** | `eslint . --max-warnings=0` passed with zero errors and zero warnings. |
| **Unit Test Suite** | `npm run test:unit` | 0 | **PASS** | 20 test files, 171 tests passed in 27.68s. |
| **Production Build** | `npm run build` | 0 | **PASS** | Turbopack compiled in 5.8s; TypeScript in 7.4s; all 40 routes compiled. |
| **Integration Suite** | `npm run test:integration` | 0 | **SKIPPED** | 12 test files, 56 tests skipped (guarded by `RUN_DATABASE_TESTS=1`). |
| **Playwright Auth E2E** | `npx playwright test tests/e2e/auth-and-shell.spec.ts` | 1 | **FAIL** | 1 test passed (unauthenticated redirect), 8 tests failed due to Phase 10 2FA prompt and dev HSTS header. |
| **Release Readiness** | `npm run release:check` | 1 | **FAIL** | Expected failure in development mode: flags missing production HTTPS, AWS S3, etc. |

---

## Acceptance Criteria Test Matrix (Section 10)

| Test ID | Scenario | Baseline Result | Current Result | Evidence | Outstanding Issue |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **TC-03** | Protected page without auth restricts access | PASS | PASS | `tests/e2e/auth-and-shell.spec.ts:32` redirected `/dashboard` to `/login` | None |
| **TC-04** | Action without required permission is rejected | PASS | PASS | `tests/unit/authorization.test.ts` verified `hasPermission`, `requirePermission` | None |
| **TC-05** | Valid project-related record is saved and retrievable | PASS | PASS | `tests/unit/phase2-validation.test.ts` passed | Full integration DB run requires `TEST_DATABASE_URL` |
| **TC-06** | Missing mandatory material data prevents submission | PASS | PASS | `tests/unit/phase3-requirement-validation.test.ts` (9 tests passed) | None |
| **TC-07** | Unauthorized approval is rejected without unauthorized state change | PASS | PASS | `tests/unit/phase3-requirement-policy.test.ts` (3 tests passed) | None |
| **TC-08** | Supplier quotations are compared according to documented rules | PASS | PASS | `tests/unit/phase4-rfq-validation.test.ts` (6 tests passed) | None |
| **TC-09** | Purchase orders follow approved workflow and eligibility conditions | PASS | PASS | Verified in schema & domain tests | None |
| **TC-10** | Goods receipts follow correct acceptance and persistence rules | PASS | PASS | `tests/unit/inventory-domain.test.ts` (7 tests passed) | None |
| **TC-11** | Stock issues validate and update relevant inventory records | PASS | PASS | `tests/unit/customer-movement-policy.test.ts` (25 tests passed) | None |
| **TC-12** | Invalid stock movements are rejected or controlled | PASS | PASS | `tests/unit/customer-movement-policy.test.ts` verified invalid transitions throw | None |
| **TC-13** | Stock movement history returns accurate records | PASS | PASS | `tests/unit/customer-movement-policy.test.ts` passed | None |
| **TC-14** | Malformed input is handled safely | PASS | PASS | `tests/unit/validation.test.ts`, `phase2-validation.test.ts` passed | None |
| **TC-15** | Database integration tests verify actual persistence | BLOCKED | BLOCKED | `tests/integration/database.test.ts` requires `RUN_DATABASE_TESTS=1` & test DB | Needs approval/provisioning of test DB |
| **TC-16** | End-to-end tests verify complete user journeys | FAIL | FAIL | E2E stalled at Phase 10 2FA prompt | ISSUE-01 in `KNOWN_ISSUES.md` |
| **TC-17** | Linting and type checking are executed and reviewed | PASS | PASS | `typecheck` (code 0) and `lint` (code 0) | None |
| **TC-18** | Production build completes with valid configuration | PASS | PASS | `next build` (code 0) | None |
