# Workflow Conventions

Phase 2 applies these conventions to project and site master lifecycles. Phase 3 applies them to material-requirement approval, and Phase 4 applies them to commercial sourcing through draft purchase-order creation.

Identity lifecycle is implemented as explicit commands:

`Employee created → optional login linked → temporary password issued → private password required → active access`

Disabling a user or employee, changing role permissions, assigning roles, or resetting a password invalidates affected sessions. Records are deactivated rather than deleted so audit references remain intact.

- Every transition is an explicit command with server authorization, validation, state guards, transaction, audit, and side-effect handling.
- Operational records are cancelled, reversed, archived, or transitioned; they are not hard-deleted.
- Success is shown only after server confirmation. Device-local state must never appear submitted or approved.
- High-risk operations require review and confirmation; rejection, cancellation, reversal, adjustment, and send-back require reasons where applicable.

## Phase 3 requirement workflow

- Material requirements can be created and edited only in `DRAFT`.
- Each draft belongs to one visible project/site pair and contains at least one active material line.
- Units are derived from the material master on the server and stored on the line as history.
- Only the draft creator can edit the draft; scoped users with view permission can inspect it.
- Removing a line deactivates it. Draft headers and lines are not hard-deleted.
- An assigned Site Supervisor or Project Manager can submit a draft.
- A different assigned Project Manager decides a Site Supervisor submission.
- A different Project Director decides a Project Manager submission.
- System Administrators cannot business-approve, even if they hold technical access permissions.
- Rejection and send-back require a reason. Send-back clears current submission fields and returns the record to editable `DRAFT`; immutable workflow history remains.
- `APPROVED` and `REJECTED` are terminal in this increment. Cancellation, delegation, escalation, thresholds, and emergency bypass remain deferred.

## Phase 4 commercial sourcing workflow

- Only an `APPROVED` material requirement can be selected for an RFQ draft.
- The server re-reads the approved requirement and its active material lines; the browser cannot replace quantities or units.
- Drafts can start with one supplier; issue requires at least three active invited suppliers. Removed supplier links become inactive history.
- Only the draft creator can edit a draft RFQ.
- Only a Purchase Manager can issue, record quotations, recommend, or cancel. Issue changes `DRAFT → ISSUED` and locks the RFQ scope.
- Each invited supplier can have one quotation with every requirement line priced and a supporting document attached. The server calculates GST and landed total.
- A recommendation requires justification and changes `ISSUED → RECOMMENDED`.
- A different Project Director can approve (`RECOMMENDED → APPROVED`), reject (`RECOMMENDED → REJECTED`), or send back with a reason (`RECOMMENDED → ISSUED`). System Administrators cannot decide.
- Approval atomically creates one `DRAFT` purchase order. Cancellation is allowed from `DRAFT` or `ISSUED` and requires a reason.
- External supplier delivery, quotation revision, PO issue/amendment, delegation, thresholds, and emergency purchasing remain disabled.

## Phase 5 purchase receiving and inventory

- A Purchase Manager issues a draft PO. Supplier acknowledgment is tracked but receiving is enabled at `ISSUED`.
- A Purchase Manager creates and edits the GRN draft. A Store Keeper verifies physical receipt; a different Project Manager approves and atomically posts stock.
- GRNs follow `DRAFT → PHYSICALLY_VERIFIED → PENDING_PM_APPROVAL → POSTED`. Accepted quantities append receipt ledger entries; damaged/rejected quantities create exception records and never enter usable stock.
- Posted accepted quantity advances the PO to `PARTIALLY_RECEIVED` or `RECEIVED`. Concurrent posting is serialized on the PO and cannot exceed any ordered line quantity.
- Damaged/rejected exceptions move through replacement, return, or resolution states and require evidence or resolution notes for terminal outcomes.
- Only a fully received PO with no draft GRNs or unresolved exceptions can be closed.
- Posted/cancelled GRNs and stock transactions are immutable in PostgreSQL. Corrections require later controlled reversal/return workflows, never a silent edit.

## Phase 2 lifecycles

- Project: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Site: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Completed/cancelled projects and sites are terminal in Phase 2.
- A site can become active only when its project is active or on hold.
- A project cannot complete or cancel until every site is completed or cancelled.
- Assignments are ended/reactivated with timestamps and audit evidence; they are never silently deleted.
