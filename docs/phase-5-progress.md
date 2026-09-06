# Phase 5 — Goods Receiving & Inventory Ledger

Phase 5 is complete on the `phase-5-inventory-foundation` branch. It implements the confirmed purchase-order receiving path and an append-only, ledger-backed inventory workspace.

## Delivered

- Scoped central, project, and site inventory locations.
- Purchase-order lifecycle: `DRAFT → ISSUED → ACCEPTED → PARTIALLY_RECEIVED → RECEIVED → CLOSED`, with controlled cancellation before any posted receipt.
- Purchase Manager-only PO issue, supplier-acceptance recording, cancellation, and fully-received close commands.
- GRN draft creation, editing, cancellation, and atomic posting against supplier-accepted POs.
- Delivery note/date, transporter, vehicle, received time, and remarks evidence.
- Separate accepted, damaged, and rejected quantities; only accepted quantity enters usable stock.
- Partial receipts and replacement receipts, with cumulative accepted quantity capped by the ordered quantity under a PO row lock.
- Automatic damaged/rejected exception records with controlled replacement, return, and resolution states plus evidence references/notes.
- One `RECEIPT` stock transaction per accepted GRN line and ledger-derived `InventoryStockBalance` quantities.
- An inventory UI containing receivable POs, GRN controls/register, exception handling, current balances, and the recent stock ledger.
- Store Keeper organization-wide inventory operation and Site Supervisor direct-site operation/visibility limited to active Site Supervisor assignments.
- System Administrator read visibility for support, without business receiving or PO lifecycle authority.
- Audit records for PO transitions, GRN create/edit/cancel/post, exception resolution, and PO close.
- PostgreSQL guards for location scope, PO/GRN state evidence, PO close, cumulative receipt quantity, GRN source integrity, immutable posted/cancelled GRNs, and immutable stock transactions.

## Confirmed business defaults

- Receiving requires recorded supplier acceptance; `ISSUED` alone is not receivable.
- Accepted quantity enters usable stock; damaged and rejected quantity does not.
- Damaged/rejected quantities remain replaceable and do not consume accepted PO quantity.
- Posted/cancelled operational records are not edited or deleted. Corrections append a controlled reversal/return record.
- Stock balance has no mutable source of truth and is always derived from the stock transaction ledger.
- Direct-to-site receipt requires a site-store GRN and an active Site Supervisor assignment.
- Negative stock remains prohibited by design; later issue/transfer work must preserve this invariant.

## Verification coverage

- Unit coverage checks receipt arithmetic, supplier-acceptance gates, partial/replacement rules, and PO receipt-state transitions.
- PostgreSQL integration coverage checks location constraints, ledger-derived balances and reversals, immutable ledger mutations, installed guard triggers, the complete receiving lifecycle, concurrent final receipt posting, exception resolution, close, audit evidence, and Site Supervisor data scope.
- Browser coverage checks authenticated application workspaces at desktop and mobile breakpoints, including the Phase 5 inventory workspace.

## Final quality gate — 2026-09-06

- `format:check`, lint, and TypeScript typecheck: passed.
- Unit tests: 10 files, 49 tests passed.
- PostgreSQL integration tests: 7 files, 21 tests passed against a fresh database built from all 13 migrations.
- Next.js production build: passed; all 20 page-data generation tasks completed.
- Playwright E2E: 16 tests passed across desktop Chromium and mobile Chromium.
- `prisma migrate status`: database schema is up to date.

## Deferred to Phase 6

- Material issue and site acknowledgment.
- Stock transfer with in-transit state and destination receipt.
- Stock adjustments and approval.
- Physical counts and variance approval.
- Material consumption, unused-material return, wastage, scrap, and project-close stock disposition.

## Production note

Exact GST/accounting treatment remains subject to KDIPL Accounts/CA confirmation and is not encoded into Phase 5 inventory logic.
