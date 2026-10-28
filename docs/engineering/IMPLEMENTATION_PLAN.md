# Implementation Plan

This document outlines prioritized, ordered tasks, dependencies, and acceptance criteria.

---

## Phase 1: Baseline Establishment & Engineering Record Initialization (Completed)
- [x] **Task 1.1**: Discover directory structure, dependencies, configuration, entry points, and existing documentation.
- [x] **Task 1.2**: Execute baseline automated checks (`tsc --noEmit`, `eslint .`, `vitest run`, `next build`).
- [x] **Task 1.3**: Document baseline results, verified facts, confirmed defects, and test matrix in `docs/engineering/`.
- [x] **Task 1.4**: Prepare formal decision requests (DEC-001, DEC-002, DEC-003) for approval-gated actions.

---

## Phase 2: Test Harness Hardening (Pending Approval of DEC-001 & DEC-003)
- [ ] **Task 2.1**: Update Playwright E2E login helpers in `tests/e2e/auth-and-shell.spec.ts` and `business-role-access.spec.ts` to handle the Phase 10 2FA challenge cleanly using the recovery code or TOTP generator.
- [ ] **Task 2.2**: Re-run Playwright desktop-chromium and mobile-chromium test suites to verify E2E journeys (TC-16).
- [ ] **Task 2.3**: Provision `kdipl_test` database, apply migrations, and run the 12 skipped integration test files with `RUN_DATABASE_TESTS=1` (TC-15).

---

## Phase 3: Integrity & Code Review (Pending Approval of DEC-002)
- [ ] **Task 3.1**: Revert staged mock values in `src/server/intelligence/dashboard-service.ts` and restore genuine Prisma metric aggregations.
- [ ] **Task 3.2**: Review and validate staged changes in `enterprise/page.tsx` and `notifications/page.tsx`.
- [ ] **Task 3.3**: Verify all unit, integration, and E2E tests remain green with zero regressions.

---

## Phase 4: Production Readiness & Release Gating
- [ ] **Task 4.1**: Audit security headers, session expiry, and role authorization boundaries.
- [ ] **Task 4.2**: Verify backup and restore procedures (`npm run backup:run`, `npm run restore:test`).
- [ ] **Task 4.3**: Update `PROJECT_STATUS.md` and `CHANGELOG.md` with final verification records.
