# Business Rules and Open Decisions

## Established principles

- Inventory will be transaction-ledger-based and auditable.
- Accepted quantity—not merely delivered quantity—will increase stock.
- Operational and financial transactions are not hard-deleted.
- Browser values for prices, tax, stock, status, identity, or authority are never trusted.
- Financial amounts will use PostgreSQL decimal/numeric values, not JavaScript floating point.
- Audit history and transaction-chain traceability are separate concepts.

## KDIPL decisions still required

- Organization scale, branches, stores, warehouses, project/site relationships, and cross-project assignments
- Approval chain, thresholds, delegation, self-approval restrictions, and emergency bypasses
- Quotation requirements, one-time vendors, supplier selection evidence, and cancellation rules
- Cash custody/settlement and GST, Tally, payable, payment, and invoice-verification treatment
- Negative-stock policy, adjustment authority, transfer receipt/discrepancy handling, physical count, and project closure
- Required document types, retention, download visibility, and signed-access duration
- Calendar versus Indian-financial-year transaction numbering
- Production hosting, object storage, secret management, backup/restore, monitoring, audit retention, and support SLA

These decisions are documentation blockers for their future phases, not reasons to invent rules during Phase 0.
