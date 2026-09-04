# Phase 5 — Goods Receiving & Inventory Ledger

Phase 5 now implements the confirmed purchase-order receiving path and ledger-backed inventory workspace on the `phase-5-inventory-foundation` branch.

## Delivered

- Inventory locations for central, project, and site stores.
- Purchase-order lifecycle foundation: `DRAFT → ISSUED → ACCEPTED → PARTIALLY_RECEIVED → RECEIVED → CLOSED`, with controlled cancellation before posted receipts.
- Purchase Manager-only PO issue, supplier-acceptance recording, and cancellation commands.
- GRN draft creation against supplier-accepted purchase orders only.
- Store Keeper receiving plus controlled Site Supervisor direct-site receiving restricted to the assigned site store.
- GRN fields for delivery note, date, transporter, vehicle, received time, and remarks.
- Separate accepted, damaged, and rejected quantities.
- Partial receipt handling with accepted quantity capped by the PO quantity.
- Replacement allowance for previously damaged/rejected quantities without treating replacements as usable over-receipt.
- Atomic GRN posting that creates one immutable `RECEIPT` stock transaction per accepted line only.
- Duplicate-post protection and database posting guards.
- PO state advancement to `PARTIALLY_RECEIVED` or `RECEIVED` after GRN posting.
- Ledger-derived `InventoryStockBalance` view; there is no mutable stock balance source of truth.
- Inventory workspace with receivable POs, GRN creation/posting, GRN register, and current stock view.
- Unit tests updated for supplier-acceptance gating, replacement rules, partial receipts, and PO receipt-state transitions.

## Confirmed business defaults applied

- Receiving requires supplier acceptance; `ISSUED` alone is not enough.
- Negative stock remains prohibited by design; Phase 6 must preserve this.
- Direct-to-site delivery is allowed only through a controlled site-store GRN and authorized Site Supervisor assignment.
- Accepted quantity enters usable stock; damaged/rejected quantity does not.
- Excess accepted quantity above the PO is prohibited.
- Posted operational records are corrected through reversal/return workflows rather than silent edits.

## Remaining Phase 5 work before merge/completion

1. Synchronize the Prisma schema `PurchaseOrderStatus` enum and new PO lifecycle fields with the migration so generated client types exactly match the database.
2. Add Purchase Manager UI controls for PO issue and supplier acceptance in Procurement.
3. Add explicit PO close command/UI after full receipt.
4. Add GRN draft editing/cancellation before posting.
5. Add damaged/rejected return/replacement register and document/photo evidence workflow.
6. Add integration tests for concurrent duplicate posting and cumulative partial receipts against PostgreSQL.
7. Run `format:check`, lint, typecheck, unit tests, integration tests, production build, and E2E; fix all failures before merge.

## Deferred to Phase 6

- Material issue and site acknowledgment.
- Stock transfer with in-transit state and destination receipt.
- Stock adjustments and approval.
- Physical counts and variance approval.
- Material consumption, return of unused material, wastage, scrap, and project-close stock disposition.

## Production note

Exact GST/accounting treatment remains subject to KDIPL Accounts/CA confirmation and is not encoded into Phase 5 inventory logic.
