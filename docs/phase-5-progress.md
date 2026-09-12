# Phase 5 — Goods Receiving & Inventory Ledger

The original Phase 5 implementation was merged from `phase-5-inventory-foundation`. PR #3 now aligns it with the customer decisions confirmed in September 2026 while preserving the append-only, ledger-backed inventory design.

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
- Opt-in, employee-linked development logins for Project Director, Project Manager, Purchase Manager, Site Supervisor, and Store Keeper, with permission-filtered desktop/mobile navigation.
- Audit records for PO transitions, GRN create/edit/cancel/post, exception resolution, and PO close.
- PostgreSQL guards for location scope, PO/GRN state evidence, PO close, cumulative receipt quantity, GRN source integrity, immutable posted/cancelled GRNs, and immutable stock transactions.

## September 2026 customer alignment

- Receiving begins at `ISSUED`; supplier acknowledgment is tracked but does not gate receiving.
- Purchase Manager creates the GRN draft, Store Keeper verifies physical receipt, and Project Manager approval atomically posts stock.
- Temporary, transit, and damaged/rejected location types supplement central, project, and site stores.
- Excess accepted quantity has no percentage ceiling but requires a Project Manager reason and audit evidence.
- The full confirmed rules and acceptance tests are in `docs/business-rules.md`, `docs/approval-matrix.md`, and `docs/phase-5-requirements.md`.

## Original Phase 5 defaults superseded by this alignment

- The original implementation required recorded supplier acceptance before receiving.
- Accepted quantity enters usable stock; damaged and rejected quantity does not.
- Damaged/rejected quantities remain replaceable and do not consume accepted PO quantity.
- Posted/cancelled operational records are not edited or deleted. Corrections append a controlled reversal/return record.
- Stock balance has no mutable source of truth and is always derived from the stock transaction ledger.
- Direct-to-site receipt requires a site-store GRN, mandatory evidence, and Site Supervisor acknowledgment.
- Temporary negative stock is a confirmed Phase 6 exception for Store Keepers and must be tracked with a three-working-day resolution deadline.

## Verification coverage

- Unit coverage checks receipt arithmetic, supplier-acceptance gates, partial/replacement rules, and PO receipt-state transitions.
- PostgreSQL integration coverage checks location constraints, ledger-derived balances and reversals, immutable ledger mutations, installed guard triggers, the complete receiving lifecycle, concurrent final receipt posting, exception resolution, close, audit evidence, and Site Supervisor data scope.
- Browser coverage checks authenticated application workspaces at desktop and mobile breakpoints, including all five business-role logins, permitted module visibility, denied administration access, and the Phase 5 inventory workspace.

## Final quality gate — 2026-09-06

- `format:check`, lint, and TypeScript typecheck: passed.
- Unit tests: 11 files, 51 tests passed.
- PostgreSQL integration tests: 7 files, 21 tests passed against a fresh database built from all 15 migrations.
- Next.js production build: passed; all 20 page-data generation tasks completed.
- Playwright E2E: 18 tests passed across desktop Chromium and mobile Chromium.
- `prisma migrate status`: database schema is up to date.

## Deferred to Phase 6

- Material issue and site acknowledgment.
- Stock transfer with in-transit state and destination receipt.
- Stock adjustments and approval.
- Physical counts and variance approval.
- Material consumption, unused-material return, wastage, scrap, and project-close stock disposition.

## Production note

Exact GST/accounting treatment remains subject to KDIPL Accounts/CA confirmation and is not encoded into Phase 5 inventory logic.

## Final customer-rule alignment

The September 2026 customer decisions are now implemented for the Phase 5 boundary:

- direct-site GRNs capture GPS and receiver identity
- clean delivery challan, material photo, supplier invoice, and receiver-signature evidence are required
- the assigned Site Supervisor acknowledges direct-site receipt
- the assigned Project Manager approves and atomically posts stock
- evidence is quarantined until local security scanning completes, executable content is blocked, and records are retained through eight financial-year ends
- issued POs use versioned amendments submitted by the Purchase Manager and independently decided by the Project Director
- partially received POs may be short-closed by the Purchase Manager only with an audited reason
- temporary negative stock is limited to Store Keepers, requires a reason, creates an audited exception due in three working days, and resolves through a correcting ledger transaction

Material issue, transfer, adjustment approval, physical count, and project-close automation remain Phase 6 workflows.
