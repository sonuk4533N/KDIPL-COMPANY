# Phase 5 — Goods Receiving & Inventory Ledger

Phase 5 has started with the inventory-safe database and domain foundation. The objective is to receive material against controlled purchase orders, preserve partial/damaged/rejected quantities, and derive stock exclusively from an immutable transaction ledger.

## Delivered in this increment

- Inventory-location model for central, project, and site stores with scope constraints.
- Numbered goods-receipt (GRN) header and line structures.
- Separate ordered, received, accepted, damaged, and rejected quantities.
- Partial-receipt domain validation and cumulative over-receipt protection.
- Immutable stock-transaction structure covering opening, receipt, issue, transfer, adjustment, and reversal directions.
- Ledger-derived `InventoryStockBalance` database view; there is no mutable stock quantity source of truth.
- Store Keeper grants for the existing `inventory.view` and `inventory.receive` permissions.
- Unit coverage for partial receipts, over-receipt prevention, stock direction, and PO-state posting guards.

## Safety boundary

The current Phase 4 purchase-order state machine contains only `DRAFT`. Phase 5 intentionally does **not** post a draft GRN into stock from a `DRAFT` purchase order. A draft PO is not treated as supplier authorization or a receivable commitment.

The database structures can retain GRN drafts, but the application posting command must remain disabled until KDIPL confirms the purchase-order issue/acceptance policy. When that decision is confirmed, the next Phase 5 increment should add the explicit PO transition and transactional GRN posting command.

## Next Phase 5 increment

1. Confirm the minimum PO state that permits receiving (`ISSUED` versus supplier `ACCEPTED`).
2. Add the explicit PO issue/acceptance state transition without introducing amendment rules that have not been approved.
3. Implement GRN create/edit/post commands with server-side RBAC and idempotency.
4. On post, atomically create one `RECEIPT` stock transaction per accepted GRN line only.
5. Prevent cumulative accepted/damaged/rejected receipt beyond ordered quantity across multiple GRNs.
6. Add GRN register/detail/receive screens for Store Keeper.
7. Add stock overview and ledger screens based on `InventoryStockBalance` and `StockTransaction`.
8. Add PostgreSQL integration tests for concurrent/duplicate posting and partial receipt behavior.

## Still deferred

- Material issue, stock transfer, stock adjustment, and physical count commands (Phase 6).
- Accounts payable, invoice verification, and payments (Phase 7).
- Negative-stock and adjustment-approval decisions beyond the established default prohibition.
- Project-close inventory disposal/transfer rules.
