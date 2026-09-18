# Phase 10 — Final QA, security and production readiness

Status: code-level security and release review completed on `phase-10-production-readiness`. Phase 10 is not complete and the application is not approved for production because the launch evidence and capability gaps below remain open.

## Automated release controls

| Check                      | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production configuration   | Complete | `npm run release:check` rejects non-production mode/origin, weak or placeholder auth material, an untraceable release SHA, test/bootstrap settings, unsafe session and login-rate policies, verbose logs, non-PostgreSQL or non-TLS/test databases, local storage, insecure storage endpoints, partial credentials and placeholder bucket/credentials. Diagnostics contain field names, not secret values. |
| Dependency vulnerabilities | Complete | `npm run security:audit` checks all dependencies at high severity and is enforced in CI. The 2026-09-19 audit found 0 vulnerabilities after updating Next.js to 16.3.5 and applying patched transitive versions.                                                                                                                                                                                           |
| Browser response policy    | Complete | Production CSP, HSTS, anti-framing, MIME sniffing, referrer and permissions headers are asserted through Playwright on desktop and mobile projects.                                                                                                                                                                                                                                                        |
| Database release path      | Complete | A new empty PostgreSQL database applied all 28 migrations and accepted the controlled seed. CI repeats migration and seed verification.                                                                                                                                                                                                                                                                    |
| Application regression     | Complete | Formatting, lint, strict typecheck, unit, PostgreSQL integration, production build and desktop/mobile browser suites are mandatory CI gates.                                                                                                                                                                                                                                                               |
| Release operations         | Complete | The [production runbook](production-runbook.md) defines immutable release identification, rollout, smoke checks, recovery, rollback, incident handling and approval records.                                                                                                                                                                                                                               |

The configuration validator proves only deterministic settings. It cannot prove who owns a service, where it is physically hosted, whether credentials are held in an approved secret manager, whether backups restore, or whether external monitoring and scanners are available.

## Local validation evidence — 2026-09-19

- Complete dependency audit: 0 vulnerabilities.
- Production preflight: passed with a synthetic, non-secret production configuration; it has not been run against KDIPL's candidate production environment.
- Fresh database: all 28 migrations applied and seed completed.
- Format, lint and TypeScript: passed.
- Unit: 113 passed across 17 files, including 8 production-readiness cases.
- PostgreSQL integration: 56 passed across 12 files.
- Production build: passed on Next.js 16.3.5.
- Playwright: 44 passed across desktop Chromium and Pixel 5/mobile Chromium, including response-security-header coverage.

GitHub CI must pass again on the exact pushed PR head before that commit can be considered a release candidate. Local results do not replace staging or production evidence.

## Code review findings that block launch

| Finding                                                                        | Required resolution                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privileged-role two-factor authentication is specified but is not implemented. | Implement, test and require the approved second factor for Admin, Accounts, Directors and Managing Director before production.                   |
| Uploads use the intentionally limited local signature scanner.                 | Select and integrate an approved production malware scanner, keep failures fail-closed/quarantined, and record a harmless test-signature result. |

These are explicit launch blockers, not configuration values that can be self-attested. The PR stays in draft until the code capability and operational evidence exist.

## Phase 10 completion gates still open

| Gate                      | Evidence required                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production infrastructure | Actual India-region app/database/storage and domain; isolated staging/production; private storage and secret-manager configuration                    |
| Backups and recovery      | Daily backups, point-in-time recovery and a witnessed isolated restore; quarterly restore schedule and approved recovery objectives                   |
| File security             | Approved production malware-scanner integration and a verified fail-closed quarantine test                                                            |
| Financial controls        | CA-approved tax settings and stock valuation; Accounts sign-off on Tally and payment operations                                                       |
| Security review           | Privileged-role 2FA implementation/evidence, role isolation, secure uploads, sessions, audit retention, authorization and offline device/cache review |
| Observability             | Uptime, errors, latency, database, storage, backup and background-job alerts; on-call owner and one-hour critical response                            |
| Performance/accessibility | Representative mid-range Android/4G field measurement and accessibility evidence                                                                      |
| Migration/data quality    | All requested legacy imports validated, previewed and MD-approved; ledger/payable totals reconciled                                                   |
| UAT and launch            | Department lead sign-offs, MD approval and all-project launch plan                                                                                    |
| Final validation          | Exact release commit passes every CI gate and real production preflight; staging smoke and recovery drill recorded                                    |

Do not mark the PR ready, label Phase 10 complete or deploy production until the outstanding gates have real evidence.
