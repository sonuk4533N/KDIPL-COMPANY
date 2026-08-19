# Development Guide

## Conventions

- Prefer server components. Add `use client` only for browser interaction.
- Keep Prisma, secrets, authentication, audit, storage, and logs in server-only modules.
- Validate inputs with Zod at the command boundary and re-check state/authorization inside the transaction.
- Keep commands explicit and return typed `CommandResult` failures.
- Use design tokens and shared components; do not copy Superdesign markup or hard-code page-specific status styles.
- Use UTC internally and format for Asia/Kolkata at presentation boundaries.

## Database workflow

1. Change `prisma/schema.prisma`.
2. Generate and inspect a migration against development PostgreSQL.
3. Regenerate the Prisma client.
4. Run unit and isolated PostgreSQL integration tests.
5. Never run destructive test cleanup against a non-test URL.

## Storage

Local uploads live below `.data/uploads` and are ignored by Git. S3-compatible configuration is selected with `FILE_STORAGE_PROVIDER=s3`. File authorization and download delivery will be added with the first document workflow.

## Completion gate

Every milestone must pass formatting, lint, strict typecheck, tests, migration verification, and production build. Review security, permissions, audit coverage, and the final diff before moving to the next phase.
