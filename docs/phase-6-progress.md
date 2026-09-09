# Phase 6 — Stock Movements, Counts & Consumption

Phase 6 has started on the `phase-6-stock-movements` branch from the merged Phase 5 `main` baseline.

## Scope

- Material issue with site acknowledgment.
- Stock transfer with dispatch/in-transit/destination receipt states.
- Controlled stock adjustments with approval.
- Physical stock counts with variance approval and ledger posting.
- Material consumption, unused-material return, wastage, and scrap reconciliation.
- Project-close stock disposition support.

## Established Phase 6 rules

- Inventory remains append-only and ledger-derived.
- Negative stock is prohibited for issue, transfer dispatch, adjustment-out, count variance posting, and returns.
- Material issue posts stock out only from a valid source location and requires later site acknowledgment where applicable.
- Transfer dispatch posts `TRANSFER_OUT`; destination receipt posts `TRANSFER_IN`. In-transit stock is not available at either location until destination receipt.
- Adjustments and physical-count variances require approval before posting.
- Physical-count posting generates only the required adjustment direction and quantity.
- Consumption reconciliation is bounded by issued quantity: consumed + returned + wastage + scrap cannot exceed issued quantity.
- Posted stock movements are not edited or hard-deleted; corrections use controlled reversal records.

## Delivered

### Increment 1 — domain rules

- Phase 6 domain types and transition guards.
- No-negative-stock validation helper for outbound movements.
- Material issue post/acknowledgment state rules.
- Transfer dispatch/receipt state rules.
- Physical-count variance calculation and adjustment direction.
- Approval gates for adjustments and stock counts.
- Issued-material reconciliation validation for consumption, returns, wastage, and scrap.
- Unit coverage for the above invariants.

### Increment 2 — database foundation

- Prisma records and workflow states for material issues, transfers, controlled adjustments, physical counts, and issued-material reconciliation.
- Actor/timestamp/cancellation evidence fields for every Phase 6 workflow transition.
- `StockTransaction` source references for issue, transfer, adjustment, count variance, and unused-material return postings.
- `RETURN` ledger direction and updated ledger-derived stock balances.
- Database checks for positive movement quantities, distinct transfer locations, exact count variance, reconciliation quantities, status evidence, and return-location evidence.
- Database transition and draft-line guards that prevent invalid workflow jumps or edits to non-draft records.
- Database source guards that require each ledger entry to match its posted source record exactly.
- Transaction-scoped advisory locking and balance rechecks that serialize concurrent outbound movements and prevent negative stock, including inbound reversals.
- Partial unique indexes that prevent duplicate issue, transfer-direction, adjustment, count, reconciliation, and reversal postings.
- PostgreSQL integration coverage for concurrent issues, duplicate posting, in-transit transfers, acknowledged-material reconciliation, returns, approval-only adjustments, count variance posting, and immutability.

The migration was verified from the complete Git migration history against a fresh PostgreSQL database. Focused Phase 6 integration coverage passes: 1 file, 3 tests.

## Verification — 9 September 2026

- Format check: passed.
- ESLint: passed with zero warnings.
- TypeScript: passed with no emit.
- Unit tests: 12 files, 57 tests passed.
- PostgreSQL integration tests: 8 files, 24 tests passed on a freshly migrated and seeded database.
- Production build: passed with Next.js 16.3.1.
- Playwright E2E: 14 tests passed across desktop and mobile Chromium; 4 optional business-role scenarios skipped because `DEMO_BUSINESS_PASSWORD` was not configured.

## Next increment

1. Add server commands with RBAC, assignment scoping, atomic posting, idempotency, and audit records.
2. Add `/inventory` workflows for issue, transfer, adjustment, stock count, and consumption.
3. Add service-level integration coverage for role/data scope and audit evidence.
4. Run format, lint, typecheck, unit/integration tests, production build, and E2E before merge.

Phase 6 is in progress. This database increment does not mark the phase complete and does not begin Phase 7.

## Out of scope

- Accounts payable, supplier invoice verification, payments, GST posting, and Tally integration remain Phase 7.
