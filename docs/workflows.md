# Workflow Conventions

Phase 2 applies these conventions to project and site master lifecycles. Phase 3 applies them to the confirmed material-requirement approval workflow without starting procurement or inventory transactions.

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

## Phase 4 RFQ draft boundary

- Only an `APPROVED` material requirement can be selected for an RFQ draft.
- The server re-reads the approved requirement and its active material lines; the browser cannot replace quantities or units.
- At least one active supplier is selected. Removed supplier links become inactive history.
- Only the draft creator can edit a draft RFQ.
- Saving remains `DRAFT` and produces no supplier communication or commercial commitment.
- Issue, quotation response, comparison, award, approval, PO conversion, revision, cancellation, and emergency transitions remain locked.

## Phase 2 lifecycles

- Project: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Site: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Completed/cancelled projects and sites are terminal in Phase 2.
- A site can become active only when its project is active or on hold.
- A project cannot complete or cancel until every site is completed or cancelled.
- Assignments are ended/reactivated with timestamps and audit evidence; they are never silently deleted.
