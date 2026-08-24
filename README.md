# KDIPL Operations Platform

Phase 1 identity/access and Phase 2 project/master-data foundation for Kumar Designs India Private Limited's internal operations platform.

## Foundation

- Next.js App Router, React, strict TypeScript, and Tailwind CSS
- PostgreSQL with Prisma migrations and UUID identifiers
- Minimal Argon2id password authentication with opaque database sessions
- Centralized permissions, audit logging, transaction numbering, storage, errors, and structured logging
- Responsive KDIPL application shell based on the approved Pass 2/3 design direction
- Employee, department, position, user, role, permission, password, and session administration
- Clients, projects, project sites, project/site teams, and assignment-backed data scope
- Material categories, units of measure, materials, suppliers, and primary contacts
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

## Phase boundary

Completed milestones are Phase 1 **Authentication, Employees, Users, Roles & Permissions** and Phase 2 **Clients, Projects, Sites, Assignments & Master Data**. Material requirements, procurement, inventory transactions, accounts, and reporting workflows remain outside this milestone and must follow their approved phases.
