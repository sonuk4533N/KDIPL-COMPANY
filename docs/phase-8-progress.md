# Phase 8 — Reporting, Search and Traceability

Status: implementation and verification complete.

## Dashboard matrix

| Role                          | Data scope                            | Dashboard focus                                                               |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Managing Director             | Company-wide                          | Procurement, budgets, payables, approvals, stock and finance exceptions       |
| Project Director              | Company-wide                          | Project procurement, commitments, budgets, approvals and exceptions           |
| Business Development Director | Company-wide projects/clients/budgets | Management summaries without operational approval powers                      |
| Purchase Manager              | Company-wide procurement scope        | Requirements, RFQs, quotations, POs, deliveries and supplier performance      |
| Project Manager               | Active project assignments            | Requirements, procurement progress, budget warnings and material availability |
| Store Keeper                  | Explicit inventory-location access    | GRNs, dispatch/receipt, low/negative stock and variances                      |
| Site Supervisor               | Active site assignments               | Site issues, acknowledgements, returns and site stock                         |
| Accounts / Accounts Admin     | Company-wide                          | Payables, invoice mismatches, payments, tax and Tally exceptions              |
| System Administrator          | Technical support visibility          | Operational health without business approval authority                        |

## Report catalogue

- Inventory: current stock by location/project/site, ledger, historical stock, low/negative stock, damaged/rejected stock, non-usable stock, pending transfers, count variance, returns and closing disposition.
- Procurement: pending/partial deliveries, purchases by project/supplier/material, quotation history and selected-versus-lowest, expiry exceptions, PO amendments and unregistered suppliers.
- Accounts: payables, ageing, payments, advances, notes, GST/TDS/RCM, mismatches, approval queues and Tally failures.
- Management: approvals, project cost/budget, procurement trend, supplier exposure/performance, overdue delivery value, stock exceptions, close readiness and audit summary.

Every report is registered in `report-catalog.ts`; unavailable direct/cash purchasing remains empty until that workflow is implemented rather than inventing transactions.

## Permission and scope rules

- View and export permissions are separate (`report.view`, `report.export`).
- Accounts, Accounts Admin, Managing Director and Project Director receive company-wide reporting scope.
- Project Managers are limited to active project assignments.
- Site Supervisors are limited to active site assignments.
- Store Keepers use explicit `InventoryLocationAccess` records.
- Purchase Managers receive procurement-wide scope.
- Business Development Directors receive projects, clients, budgets and allowed management reports only.
- Saved filters contain criteria, never authorization; live authorization is reapplied when reopened or exported.
- Search builds every query from current server-side permission and assignment scope and never returns unauthorized titles or counts.

## Formula definitions

- Payable = approved payable + debit notes − finalized payments − credit notes − applied advances.
- Remaining budget = latest approved budget − approved invoice actuals.
- Outstanding payable = max(approved invoice actuals − paid allocation, 0).
- Low-stock shortage = max(reorder level − current ledger quantity, 0).
- On-time delivery = accepted quantity posted by contractual date / delivered quantity.
- Invoice accuracy = invoices passing three-way match without mismatch / invoices received.
- Damage/rejection rate = damaged + rejected quantity / delivered quantity.
- Accepted-quality rate = accepted quantity / delivered quantity.
- Replacement response = mean hours from exception creation to resolved state.
- Price competitiveness shows selected landed price against both median and lowest valid quotations.

All supplier metrics expose numerator/denominator and return “insufficient data” for an empty denominator. Material issue is not reported as consumption.

## Stock valuation

Effective-dated policies support `MOVING_WEIGHTED_AVERAGE`, `FIFO`, `LAST_APPROVED_PURCHASE_RATE` and `QUANTITY_ONLY`. Only Accounts Admin can configure a policy. The seeded/default policy is `QUANTITY_ONLY`, and the UI states: “Stock monetary valuation is awaiting CA-approved policy.” Historical stock rows retain the selected policy and its effective date.

## Database and performance

- Added valuation policy, project/location low-stock settings, location access, project budget revisions, saved filters, recent searches, export jobs and supplier blacklist history.
- `reporting_stock_balance` is a rebuildable ledger-derived view with correct inbound/outbound and reversal signs.
- Added date/status indexes for stock transactions, invoices, payments and GRNs.
- Detail queries have bounded result sizes/date ranges and stable ordering.
- Large-export state supports `QUEUED → PROCESSING → COMPLETED`, `PROCESSING → FAILED` and `FAILED → RETRY_QUEUED`; idempotency keys suppress duplicate requests.
- Integration coverage asserts that the largest reporting indexes exist. PostgreSQL remains the source of quantity and monetary decimals.

## Export security

- CSV, XLSX, PDF and print use the same report service and live permissions as the screen.
- CSV/XLSX cells beginning with formula-control characters are apostrophe-prefixed.
- XML and CSV content is escaped; PDF includes generation metadata and page numbering.
- Jobs record request/completion, filters, financial year, user, row count and 24-hour expiry.
- Export responses are private/no-store and sensitive views/exports are audited without document contents.

## Notifications

The provider-neutral reporting alert producer covers approvals older than 24/48 hours, overdue deliveries, low stock, negative-stock deadlines, failed payments/Tally exports, unresolved damaged/rejected stock and blocked project closure. Channels are in-app and WhatsApp; no WhatsApp provider or credential is hard-coded.

## Test status

- Unit: 96 tests passed, including 8 Phase 8 formula/security tests.
- PostgreSQL integration: 48 tests passed, including 7 Phase 8 scope, ledger, traceability, idempotency and index tests.
- Production build: passed on Next.js 16.3.1.
- Playwright: all 36 desktop/mobile scenarios passed; the full clean run passed 35, and the corrected mobile touch-target scenario passed on its focused rerun.

## Operational dependencies

- KDIPL/CA must approve a production stock valuation policy before monetary stock values are authoritative.
- A WhatsApp provider/credential and background worker schedule remain deployment configuration.
- Object-storage malware scanning and signed-link infrastructure remain deployment dependencies from the existing secure file subsystem.
