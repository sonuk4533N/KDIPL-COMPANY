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

- A Purchase Manager issues a draft PO and records supplier acceptance before receiving is enabled.
- A Store Keeper can receive across active central, project, and site stores that match the PO. A Site Supervisor can receive and view inventory only at a site store covered by an active Site Supervisor assignment.
- GRNs remain editable/cancellable in `DRAFT`. Posting is atomic and terminal: accepted quantities append receipt ledger entries; damaged/rejected quantities create exception records and never enter usable stock.
- Posted accepted quantity advances the PO to `PARTIALLY_RECEIVED` or `RECEIVED`. Concurrent posting is serialized on the PO and cannot exceed any ordered line quantity.
- Damaged/rejected exceptions move through replacement, return, or resolution states and require evidence or resolution notes for terminal outcomes.
- Only a fully received PO with no draft GRNs or unresolved exceptions can be closed.
- Posted/cancelled GRNs and stock transactions are immutable in PostgreSQL. Corrections require later controlled reversal/return workflows, never a silent edit.

## Phase 6 stock movements and adjustments

- Material issues move `DRAFT → POSTED → ACKNOWLEDGED`; posting creates the source `ISSUE` ledger entry, and only the actively assigned destination Site Supervisor acknowledges it.
- Stock transfers move `DRAFT → DISPATCHED → RECEIVED`. Dispatch creates `TRANSFER_OUT`; receipt creates `TRANSFER_IN`, so stock remains unavailable while in transit.
- Controlled adjustments move `DRAFT → SUBMITTED → APPROVED/REJECTED`, with `APPROVED → POSTED` or evidenced cancellation. Rejected adjustments never change stock.
- Store Keepers create, submit, cancel, and post adjustments. A different Project Director decides with mandatory notes; System Administrators cannot perform business commands.
- Posting an approved adjustment creates exactly one linked `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` ledger entry. Stock-out posting locks and rechecks the current balance to prevent negative stock.
- Physical counts follow `DRAFT → SUBMITTED → APPROVED/REJECTED`, with `APPROVED → POSTED` or evidenced cancellation. A different Project Director decides the Store Keeper's submitted snapshot.
- Count posting locks each balance key and rejects stale book snapshots. It creates one source-linked adjustment entry per non-zero variance; an exact count posts with no ledger movement.
- Issue, transfer, adjustment, count, and ledger records become immutable after their controlled transitions; duplicate source postings are blocked in PostgreSQL.
- Issued-material reconciliation moves `DRAFT → POSTED` or evidenced cancellation. Posting is allowed only after destination acknowledgment and classifies material as consumed, returned unused, wastage, or scrap.
- Reconciliation posting serializes on the issue line and rechecks all prior posted quantities. Returned material creates one linked `RETURN` entry; the other classifications are accountability facts because the original issue already removed them from stock.
- `PROJECT_CLOSE` reconciliation must consume the full remaining quantity across the four classifications and prevents any later reconciliation for that issue line. Project-close transfers remain available for physical stock relocation before final classification.

## Phase 2 lifecycles

- Project: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Site: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Completed/cancelled projects and sites are terminal in Phase 2.
- A site can become active only when its project is active or on hold.
- A project cannot complete or cancel until every site is completed or cancelled.
- Assignments are ended/reactivated with timestamps and audit evidence; they are never silently deleted.
