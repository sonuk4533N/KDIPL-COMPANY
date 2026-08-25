# Phase 4 — Commercial Sourcing Workflow

Phase 4 now provides a controlled internal RFQ-to-draft-PO workflow. Approved material demand is sourced by the Purchase Manager and independently decided by a Project Director.

## Delivered

- Numbered RFQ drafts linked to one approved material requirement; quantities and units are always re-read on the server.
- Issue guard requiring at least three active invited suppliers and a current response due date.
- Purchase Manager-only RFQ issue, supplier quotation capture, recommendation, and cancellation. System Administrators cannot perform these commercial actions.
- One documented quotation per invited supplier, including reference, validity, delivery date, payment terms, unit prices, GST, freight, and supporting PDF/image evidence.
- Server-side decimal calculation of line subtotals, subtotal, GST amount, and landed total.
- Side-by-side quotation comparison and mandatory supplier recommendation justification.
- Independent Project Director approval, rejection, or send-back. The creator/recommender cannot approve, and System Administrators have no business-approval bypass.
- Required reasons for rejection, send-back, and RFQ cancellation.
- Approval atomically creates one numbered `DRAFT` purchase order by copying the approved quotation and its material lines.
- Immutable RFQ workflow events, audit evidence, RFQ detail controls, and RFQ/draft-PO registers.
- PostgreSQL constraints for valid state evidence, valid transitions, INR commercial arithmetic, dates, uniqueness, and restrictive history.

## Deliberately deferred

- External supplier email/portal delivery, reminders, acknowledgements, and late-response exceptions.
- Quotation revision/replacement and multi-document versioning.
- Draft PO editing, issue, acceptance, amendment, cancellation, and downstream goods receipt.
- Value thresholds, multi-level approval, delegation, escalation, alternate approvers, emergency purchasing, and one-time vendors.

Emergency purchasing and approval delegation remain disabled. A generated purchase order is a draft and creates no inventory or payable transaction.
