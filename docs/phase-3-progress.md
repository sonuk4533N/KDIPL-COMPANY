# Phase 3 — Material Requirement Draft Foundation

Phase 3 has started with the policy-independent draft layer. It intentionally does not implement submission, approval, rejection, send-back, delegation, escalation, or emergency bypass behavior until KDIPL confirms the governing rules.

## Delivered in this increment

- Numbered material requirement drafts tied to one project and one site.
- Assignment-scoped visibility and mutation authorization.
- Validated material lines with positive decimal quantities and trusted unit snapshots.
- Draft editing that preserves removed lines as inactive history rather than deleting operational rows.
- Atomic header, line, sequence, and audit transactions.
- Responsive list, create, and detail/edit screens for desktop and mobile use.
- Database constraints for project/site consistency, line uniqueness, quantity, and referential history.

## Locked pending KDIPL decisions

- Submitter and reviewer roles, approval levels, value or material thresholds, and escalation.
- Delegation periods, alternate approvers, and absence handling.
- Self-approval and segregation-of-duty rules.
- Rejection, send-back, resubmission, cancellation, and emergency requirements.
- Notification recipients, response time targets, and required supporting documents.

The PostgreSQL status enum currently contains only `DRAFT`. Later workflow states will be added only with an approved transition and authorization specification.
