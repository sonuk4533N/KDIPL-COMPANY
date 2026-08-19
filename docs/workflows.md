# Workflow Conventions

Phase 0 defines conventions but does not implement business state machines.

- Every transition is an explicit command with server authorization, validation, idempotency, transaction, audit, and side-effect handling.
- Operational records are cancelled, reversed, or archived; they are not hard-deleted.
- Success is shown only after server confirmation. Device-local drafts must never appear submitted.
- High-risk operations require review and confirmation; rejection, cancellation, reversal, and adjustment require reasons where applicable.
- Partial receiving, damaged material, partial issue, discrepancies, and send-back/resubmission remain first-class future states.

The proposed `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED | CHANGES_REQUESTED` pattern is illustrative only. KDIPL must approve each workflow and segregation-of-duty rule before implementation.
