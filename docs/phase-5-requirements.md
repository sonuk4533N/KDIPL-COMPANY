# Phase 5 Customer Alignment Requirements

## Purpose

Align the merged Phase 5 implementation with customer-confirmed rules without starting Phase 6. Earlier Phase 5 defaults requiring supplier acceptance, allowing Store Keeper/Site Supervisor draft creation, immediate Store Keeper posting, fixed over-receipt rejection, and absolute negative-stock prohibition are superseded where this document conflicts.

## Required PO lifecycle alignment

- Purchase Manager issues a PO.
- `ISSUED` and `PARTIALLY_RECEIVED` POs are receivable.
- Supplier acknowledgment is retained as optional evidence and never gates receipt.
- Amendments are versioned and repeat approval.
- Purchase Manager cancellation requires a reason.
- Partially received orders use short-close with a reason.

## Required GRN state machine

`DRAFT → PHYSICALLY_VERIFIED → PENDING_PM_APPROVAL → POSTED`

Alternative terminal transitions:

- `DRAFT | PHYSICALLY_VERIFIED | PENDING_PM_APPROVAL → CANCELLED`
- `POSTED → REVERSED` only through a linked reversal transaction

Rules:

1. Purchase Manager alone creates the draft.
2. Store Keeper verifies physical receipt and evidence.
3. Project Manager approves or sends back/rejects.
4. Approval and stock-ledger posting occur atomically.
5. No usable stock changes before approval.
6. Self-verification/approval and System Administrator business approval are prohibited.
7. Every transition records actor, timestamp, reason/evidence, prior state, and resulting state.

## Quantities and exceptions

- Each line stores delivered, accepted, damaged, rejected, and remaining quantities.
- Partial GRNs are allowed.
- Project Manager can short-close remaining PO quantities.
- Excess delivery is allowed only after explicit Project Manager approval with a mandatory reason; no fixed percentage ceiling is encoded.
- Damaged/rejected quantity is non-usable and moves to a damaged/rejected location.
- Return-to-Vendor supports replacement or credit-note resolution.
- Reversal replaces edits to a posted receipt.
- Concurrency and idempotency must prevent duplicate posting and lost updates.

## Required locations

- `CENTRAL_STORE`
- `PROJECT_STORE`
- `SITE_STORE`
- `TEMPORARY_STORE`
- `TRANSIT`
- `DAMAGED_REJECTED`

Stock remains ledger-derived and scoped by location, project, and site.

## Direct-site evidence

Before PM approval of a direct-site GRN, require:

- GPS coordinates and captured time
- delivery challan
- material photos
- supplier invoice
- vehicle details
- receiver signature
- Site Supervisor acknowledgment

File controls: 50 MB maximum, malware scan/quarantine, executable block, eight-financial-year retention, and 24-hour signed download URLs.

## Temporary negative stock

This is a confirmed exception for Store Keepers and must not be implemented as an untracked mutable balance.

- Each negative event records Store Keeper, location, material, source transaction, reason, and resolution deadline.
- Deadline is three working days.
- Open exceptions are visible in the inventory workspace and audit/reporting.
- Correction uses a receipt, return, or approved reversal/adjustment; never a direct balance edit.
- Overdue exceptions create in-app alerts.
- This rule prepares controls needed by Phase 6 but does not implement the Phase 6 issue workflow here.

## Acceptance tests

- Receiving succeeds from `ISSUED` without supplier acknowledgment.
- Purchase Manager alone can create a GRN draft.
- Store Keeper can verify but cannot approve/post stock.
- Project Manager approval atomically posts stock once.
- Concurrent approvals cannot duplicate ledger entries.
- Rejection/send-back changes no balance.
- Excess receipt without PM approval/reason fails; approved excess succeeds and is audited.
- Direct-site approval fails when any required evidence or acknowledgment is missing.
- Damaged/rejected quantities never increase usable stock.
- Posted receipt mutation fails; linked reversal restores the balance.
- Every new location type satisfies correct project/site scope constraints.
- Existing Phase 1–4 tests remain green.

## Phase boundary

Material issue, transfer, stock adjustment, physical count, consumption, wastage, and project-close automation remain Phase 6. This alignment may add shared data structures only when necessary for Phase 5 integrity; it must not expose unfinished Phase 6 workflows.
