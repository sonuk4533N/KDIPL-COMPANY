# KDIPL Operations Platform

Phases 1–9 implement KDIPL's identity, projects, procurement, inventory, accounts, reporting and mobile/offline workflows. Phase 10 final QA and production readiness is in progress.

## Foundation

- Next.js App Router, React, strict TypeScript, and Tailwind CSS
- PostgreSQL with Prisma migrations and UUID identifiers
- Minimal Argon2id password authentication with opaque database sessions
- Centralized permissions, audit logging, transaction numbering, storage, errors, and structured logging
- Responsive KDIPL application shell based on the approved Pass 2/3 design direction
- Employee, department, position, user, role, permission, password, and session administration
- Clients, projects, project sites, project/site teams, and assignment-backed data scope
- Material categories, units of measure, materials, suppliers, and primary contacts
- Numbered, assignment-scoped material requirements with guarded approvals and immutable workflow history
- Controlled RFQ issue, documented supplier quotation comparison, independent approval, and automatic draft purchase orders
- Inventory locations, draft goods receipts, and an immutable stock ledger with derived balances
- Vitest, PostgreSQL integration tests, Playwright, and GitHub Actions

## Local setup

1. Install Node.js 22+, npm 11+, and Docker Desktop.
2. Copy `.env.example` to `.env` and replace `AUTH_SECRET` with at least 32 random characters.
3. Optionally set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and `BOOTSTRAP_ADMIN_NAME` for a development administrator. Set `DEMO_BUSINESS_PASSWORD` to seed the five development business-role accounts listed in [RBAC](docs/rbac.md).
4. Start PostgreSQL: `docker compose up -d postgres postgres-test`.
5. Install and prepare the application:

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

On Windows PowerShell systems that block npm scripts, use `npm.cmd` in place of `npm`. The bootstrap administrator is created only when all three `BOOTSTRAP_ADMIN_*` values are present before `npm.cmd run db:seed`. Sign in with those configured email/password values; rerun the seed after correcting them.

## Quality commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

Database tests require `RUN_DATABASE_TESTS=1` and an isolated `TEST_DATABASE_URL`. Never point the integration suite at development or production data.

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [RBAC](docs/rbac.md)
- [Workflow conventions](docs/workflows.md)
- [Business rules and unresolved decisions](docs/business-rules.md)
- [Development guide](docs/development.md)
- [Phase 2 completion record](docs/phase-2-progress.md)
- [Phase 3 progress record](docs/phase-3-progress.md)
- [Phase 4 progress record](docs/phase-4-progress.md)
- [Phase 5 progress record](docs/phase-5-progress.md)
- [Phase 6 customer alignment](docs/phase-6-customer-alignment.md)
- [Phase 7 progress](docs/phase-7-progress.md)
- [Phase 8 progress](docs/phase-8-progress.md)
- [Phase 9 mobile/offline](docs/phase-9-mobile-offline.md)
- [Phase 10 progress](docs/phase-10-progress.md)
- [Production release and recovery runbook](docs/production-runbook.md)

## Phase boundary

Phases 1–9 have been merged. Phase 10 release validation and production operations are in progress. A passing build or CI run does not itself approve production deployment; use the [Phase 10 release gates](docs/phase-10-progress.md) and [production runbook](docs/production-runbook.md).
