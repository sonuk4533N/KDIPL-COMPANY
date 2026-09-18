# Phase 10 — Final QA, security and production readiness

Status: started on `phase-10-production-readiness` from merged Phase 9 `main`. This phase is not complete and the application is not approved for production.

## First increment

- A deterministic production configuration validator checks for HTTPS application origin, real application secret, PostgreSQL URL syntax, S3 storage settings, secure custom storage endpoint and absence of test/demo bootstrap credentials.
- `npm run release:check` runs that validator against the candidate production environment. The command prints the missing configuration fields, never credentials or connection strings.
- Unit tests exercise a valid deployment configuration and common unsafe configurations.
- [Production runbook](production-runbook.md) defines staging, rollout, smoke checks, backup/restore drill, incident handling, monitoring and department/MD sign-off.

## Existing baseline

- The Phase 9 branch `f29edab1f20d905605c314fa431466bbf06873d9` passed GitHub CI run [35382409070](https://github.com/sonuk4533N/KDIPL-COMPANY/actions/runs/35382409070) before merging into `main`.
- Existing CI covers migrations, seed, formatting, lint, typecheck, unit/integration suites, production build and desktop/mobile Playwright.
- `/api/health` checks database reachability and returns 503 on failure.

## Phase 10 completion gates still open

| Gate                      | Evidence required                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Production infrastructure | Actual India-region app/database/storage and domain; isolated staging/production; private storage and secret-manager configuration  |
| Backups and recovery      | Daily backups, point-in-time recovery and a witnessed isolated restore; quarterly restore schedule and approved recovery objectives |
| File security             | Named approved production malware scanner and a verified fail-closed quarantine test                                                |
| Financial controls        | CA-approved tax settings and stock valuation; Accounts sign-off on Tally and payment operations                                     |
| Security review           | Role isolation and two-factor setup, secure uploads, sessions, audit retention, authorization and offline device/cache review       |
| Observability             | Uptime, errors, latency, database, storage, backup and background-job alerts; on-call owner and one-hour critical response          |
| Performance/accessibility | Representative mid-range Android/4G field measurement and accessibility evidence                                                    |
| Migration/data quality    | All requested legacy imports validated, previewed and MD-approved; ledger/payable totals reconciled                                 |
| UAT and launch            | Department lead sign-offs, MD approval and all-project launch plan                                                                  |
| Final validation          | The exact release commit passes every CI gate and production preflight; staging smoke and recovery drill recorded                   |

Do not label Phase 10 complete or deploy production until the outstanding gates have real evidence. Provider and account selections are operational decisions for KDIPL; the repository can encode and test their chosen configuration after those details are available.
