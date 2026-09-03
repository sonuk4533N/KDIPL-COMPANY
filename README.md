# KDIPL Operations Platform

Phase 1 identity/access, Phase 2 project/master-data, Phase 3 material requirement approval, Phase 4 commercial sourcing, and the Phase 5 inventory foundation for Kumar Designs India Private Limited's internal operations platform.

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
3. Optionally set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and `BOOTSTRAP_ADMIN_NAME` for a development administrator.
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

## Phase boundary

Completed milestones are Phase 1 **Authentication, Employees, Users, Roles & Permissions**, Phase 2 **Clients, Projects, Sites, Assignments & Master Data**, Phase 3 **Material Requirements & Approval**, and the approved Phase 4 **RFQ Commercial Workflow through Draft PO Creation**. Phase 5 **Goods Receiving & Inventory Ledger** has started with its database/domain foundation; GRN posting remains disabled pending confirmation of the minimum receivable PO state. External supplier communication, accounts, reporting, and later inventory commands remain locked to future approved increments.
