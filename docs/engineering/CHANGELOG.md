# Changelog

All notable engineering changes, architectural decisions, and migrations are documented in this file.

---

## [Unreleased] - 2026-10-28

### Added
* Initialized persistent AntiGravity engineering records under `docs/engineering/`:
  * `PROJECT_CONTEXT.md`
  * `REQUIREMENTS.md`
  * `DECISIONS.md`
  * `OPEN_QUESTIONS.md`
  * `KNOWN_ISSUES.md`
  * `IMPLEMENTATION_PLAN.md`
  * `TEST_RESULTS.md`
  * `CHANGELOG.md`
  * `PROJECT_STATUS.md`

### Discovered & Documented
* Established baseline verification:
  * TypeScript type checking: PASS (0 errors)
  * ESLint: PASS (0 errors, 0 warnings)
  * Unit test suite: PASS (20 suites, 171 passed)
  * Turbopack production build: PASS (40 routes)
* Diagnosed E2E failure in `auth-and-shell.spec.ts` as an out-of-sync test helper encountering the Phase 10 Two-Factor Authentication prompt (`ISSUE-01`).
* Identified staged hardcoded mock values in `src/server/intelligence/dashboard-service.ts` (`ISSUE-03`).
* Prepared formal decision requests: DEC-001, DEC-002, DEC-003.
