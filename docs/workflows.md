# Workflow Conventions

Phase 1 preserves these conventions and does not implement ERP business state machines.

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
