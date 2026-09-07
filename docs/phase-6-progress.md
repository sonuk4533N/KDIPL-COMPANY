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

## Delivered in the first increment

- Phase 6 domain types and transition guards.
- No-negative-stock validation helper for outbound movements.
- Material issue post/acknowledgment state rules.
- Transfer dispatch/receipt state rules.
- Physical-count variance calculation and adjustment direction.
- Approval gates for adjustments and stock counts.
- Issued-material reconciliation validation for consumption, returns, wastage, and scrap.
- Unit coverage for the above invariants.

## Next increment

1. Add Prisma models/migration for material issue, transfer, adjustment, count, and consumption records.
2. Add database guards and source-reference fields on `StockTransaction`.
3. Add server commands with RBAC, assignment scoping, row locking, idempotency, and audit records.
4. Add `/inventory` workflows for issue, transfer, adjustment, stock count, and consumption.
5. Add PostgreSQL integration coverage for concurrent outbound stock and duplicate posting.
6. Run format, lint, typecheck, unit/integration tests, production build, and E2E before merge.

## Out of scope

- Accounts payable, supplier invoice verification, payments, GST posting, and Tally integration remain Phase 7.
