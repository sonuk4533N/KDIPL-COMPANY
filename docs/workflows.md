# Workflow Conventions

Phase 2 applies these conventions to project and site master lifecycles without starting procurement or inventory transactions.

Identity lifecycle is implemented as explicit commands:

`Employee created → optional login linked → temporary password issued → private password required → active access`

Disabling a user or employee, changing role permissions, assigning roles, or
resetting a password invalidates affected sessions. Records are deactivated
rather than deleted so audit references remain intact.

- Every transition is an explicit command with server authorization, validation, idempotency, transaction, audit, and side-effect handling.
- Operational records are cancelled, reversed, or archived; they are not hard-deleted.
- Success is shown only after server confirmation. Device-local drafts must never appear submitted.
- High-risk operations require review and confirmation; rejection, cancellation, reversal, and adjustment require reasons where applicable.
- Partial receiving, damaged material, partial issue, discrepancies, and send-back/resubmission remain first-class future states.

The proposed `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED | CHANGES_REQUESTED` pattern is illustrative only. KDIPL must approve each workflow and segregation-of-duty rule before implementation.

## Phase 2 lifecycles

- Project: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Site: `PLANNING → ACTIVE → ON_HOLD → ACTIVE`, with controlled completion or cancellation.
- Completed/cancelled projects and sites are terminal in Phase 2.
- A site can become active only when its project is active or on hold.
- A project cannot complete or cancel until every site is completed or cancelled.
- Assignments are ended/reactivated with timestamps and audit evidence; they are never silently deleted.
