# Business Rules and Open Decisions

## Established principles

- Inventory will be transaction-ledger-based and auditable.
- Accepted quantity—not merely delivered quantity—will increase stock.
- Operational and financial transactions are not hard-deleted.
- Browser values for prices, tax, stock, status, identity, or authority are never trusted.
- Financial amounts will use PostgreSQL decimal/numeric values, not JavaScript floating point.
- Audit history and transaction-chain traceability are separate concepts.
- Project and site codes are normalized to uppercase and stable; site codes are unique within a project.
- Project/site access requires both the named permission and an active employee assignment, except the technical System Administrator bypass.
- The project creator is automatically retained as a project member when a non-administrator creates a project.
- One active primary project manager, site supervisor, and supplier contact is enforced at a time.
- Material minimum and reorder defaults are global Phase 2 policy values; reorder level cannot be lower than minimum stock.
- Registered suppliers require a structurally valid GSTIN; unregistered suppliers store no GSTIN.
- Draft material requirements belong to exactly one project/site pair, use material-master units, require positive quantities, and retain removed lines as inactive history.
- Assigned Site Supervisors and Project Managers may submit requirements. A different assigned Project Manager approves a Site Supervisor submission; a different Project Director approves a Project Manager submission.
- Requirement creators and submitters cannot approve their own records. System Administrators have no business-approval bypass. Rejection and send-back require reasons.
- RFQ drafts can reference only approved material requirements. Material scope is read from the approved requirement on the server.
- A Purchase Manager issues an RFQ to at least three active invited suppliers, records one documented quotation per supplier, and recommends a supplier with mandatory justification.
- Quotation line totals, subtotal, GST, freight, and landed total are calculated with server-side decimal arithmetic in INR.
- A different Project Director approves, rejects, or sends back the recommendation. Creators/recommenders cannot self-approve, and System Administrators cannot perform business approval.
- Approval creates one draft purchase order atomically. Rejection, send-back, and cancellation require reasons. Emergency purchasing and delegation are disabled.

## KDIPL decisions still required

- Organization scale, branches, stores, warehouses, project/site relationships, and cross-project assignments
- Approval thresholds, multi-level approvals, escalation, alternate approvers, and future delegation policy
- One-time vendors, supplier communication delivery, quotation revisions, and late-response exceptions
- Draft purchase-order issue, amendments, cancellation, supplier acceptance, and downstream receipt rules
- Cash custody/settlement and GST, Tally, payable, payment, and invoice-verification treatment
- Negative-stock policy, adjustment authority, transfer receipt/discrepancy handling, physical count, and project closure
- Required document types, retention, download visibility, and signed-access duration
- Calendar versus Indian-financial-year transaction numbering
- Production hosting, object storage, secret management, backup/restore, monitoring, audit retention, and support SLA

These decisions are documentation blockers for their future phases, not reasons to invent transaction rules during Phase 2.
