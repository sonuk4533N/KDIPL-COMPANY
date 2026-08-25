# Phase 4 — Procurement Foundation

Phase 4 has started with the policy-independent RFQ draft layer. It converts approved material demand into controlled sourcing preparation without issuing supplier communications or encoding unconfirmed commercial decisions.

## Delivered in this increment

- Procurement workspace for approved material requirements.
- Numbered RFQ drafts linked to exactly one approved requirement.
- Active supplier selection with inactive-link history rather than silent deletion.
- Response due date and commercial draft notes.
- Server-derived requirement material scope and atomic audit evidence.
- Organization-wide draft access for the Purchase Manager role and technical access for the System Administrator.
- Responsive RFQ creation, approved-demand preview, metrics, and draft register.
- PostgreSQL restrictive relationships for requirements, suppliers, creators, and audit history.

## Locked pending KDIPL decisions

- Whether RFQs are mandatory and the minimum quotation count.
- Supplier communication/issue, response capture, attachments, and late-response handling.
- Commercial comparison fields, taxes, freight, payment terms, validity, and landed-cost calculation.
- Supplier award evidence, exceptions, one-time vendors, and segregation of duties.
- Purchase-order creation, approvals, thresholds, revisions, cancellation, and emergency purchasing.

The only RFQ status in this increment is `DRAFT`. Saving a draft never sends, awards, approves, or creates a purchase order.
