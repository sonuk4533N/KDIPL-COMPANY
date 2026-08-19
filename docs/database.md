# Database Foundation

## Models

- `Employee` represents a person in the organization; `User` is an optional login identity linked one-to-one.
- `Department` and the employee manager relation establish an extensible organization baseline.
- `Role`, `Permission`, `UserRole`, and `RolePermission` implement configurable many-to-many RBAC.
- `Session` stores only hashed opaque tokens, expiry, activity, revocation, and privacy-preserving request metadata.
- `AuditLog` records sanitized actor/action/entity change evidence.
- `FileRecord` stores metadata and opaque object keys, never file bytes.
- `BusinessSequence` provides atomic `(prefix, year)` numbering.
- `RateLimitBucket` provides shared authentication throttling without storing raw email/IP keys.

All primary identifiers are PostgreSQL UUIDs. Timestamps are stored in UTC and displayed in the configured KDIPL locale/timezone. Relations, composite keys, unique constraints, and lookup/expiry indexes are explicit in `prisma/schema.prisma`.

## Migrations

Schema changes require reviewed migration files. Production uses `prisma migrate deploy`; `db push` is not a deployment strategy. Backups and restore procedures must be approved before production.

## Transaction numbering

`TransactionNumberService` performs one atomic PostgreSQL upsert/increment with `RETURNING`. It produces values such as `MR-2026-0001` and is safe under concurrency. Calendar year is the Phase 0 default; KDIPL must decide whether numbering resets by Indian financial year.

## Future inventory

Inventory balance will be derived from an immutable stock-transaction ledger. A mutable `currentStock` field must never become the independent authority. The ledger schema is deliberately deferred.
