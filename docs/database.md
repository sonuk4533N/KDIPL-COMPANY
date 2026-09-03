# Database Foundation

## Models

- `Employee` represents a person in the organization; `User` is an optional login identity linked one-to-one.
- `Department`, `Position`, and the employee manager relation establish an extensible organization baseline.
- `Role`, `Permission`, `UserRole`, and `RolePermission` implement configurable many-to-many RBAC.
- `Session` stores only hashed opaque tokens, expiry, activity, revocation, and privacy-preserving request metadata.
- `AuditLog` records sanitized actor/action/entity change evidence.
- `FileRecord` stores metadata and opaque object keys, never file bytes.
- `BusinessSequence` provides atomic `(prefix, year)` numbering.
- `RateLimitBucket` provides shared authentication throttling without storing raw email/IP keys.
- `Client`, `Project`, and `Site` form the Phase 2 project hierarchy.
- `ProjectAssignment` and `SiteAssignment` relate active employees to scoped responsibilities without duplicating names.
- `MaterialCategory`, `UnitOfMeasure`, and `Material` provide normalized material masters with decimal stock-policy defaults.
- `Supplier` and `SupplierContact` provide GST-aware supplier and primary-contact masters.
- `MaterialRequirement` and `MaterialRequirementLine` provide the Phase 3 header and immutable-reference line foundation. `MaterialRequirementWorkflowEvent` retains every submission and decision transition. Lines snapshot the selected unit and are deactivated rather than deleted.
- `RequestForQuotation`, `RequestForQuotationSupplier`, and `RequestForQuotationWorkflowEvent` provide the Phase 4 sourcing state machine and immutable transition history.
- `SupplierQuotation`, `SupplierQuotationLine`, and `SupplierQuotationDocument` retain documented commercial offers and server-calculated INR totals.
- `PurchaseOrder` and `PurchaseOrderLine` retain the draft PO created from an independently approved quotation.
- `InventoryLocation`, `GoodsReceipt`, and `GoodsReceiptLine` provide the Phase 5 receiving foundation with project/site scope and separate accepted, damaged, and rejected quantities.
- `StockTransaction` is the immutable inventory ledger. `InventoryStockBalance` derives quantity on hand from transaction direction and reversals.

Phase 1 adds credential lifecycle fields to `User`: `mustChangePassword`,
`passwordChangedAt`, and `lastLoginAt`. Temporary administrator-issued
passwords set the first flag; successful private password changes clear it and
revoke other sessions.

All primary identifiers are PostgreSQL UUIDs. Timestamps are stored in UTC and displayed in the configured KDIPL locale/timezone. Relations, composite keys, unique constraints, and lookup/expiry indexes are explicit in `prisma/schema.prisma`.

## Migrations

Schema changes require reviewed migration files. Production uses `prisma migrate deploy`; `db push` is not a deployment strategy. Backups and restore procedures must be approved before production.

`20260820030000_phase1_identity_access` introduces positions, employee-position
links, and user credential lifecycle fields without deleting or rewriting
existing identity records.

`20260823184544_phase2_project_foundation` adds the Phase 2 hierarchy and master-data tables. Its reviewed PostgreSQL constraints protect date ordering, nonnegative stock levels, unit precision, GST registration consistency, assignment periods, one active primary manager/supervisor, and one active primary supplier contact. Parent/master records use restrictive foreign keys; application workflows deactivate or close records instead of hard-deleting them.

`20260825090000_phase3_draft_requirements` adds numbered draft requirements and material lines. A composite site/project foreign key prevents cross-project site references; positive quantity, unique material-line, unit snapshot, and restrictive history constraints are enforced in PostgreSQL.

`20260825160000_phase3_requirement_approval` adds submitted/approved/rejected states, accountable submitter and decision actors, and immutable workflow events. PostgreSQL check constraints reject incomplete header states, invalid transitions, and missing rejection/send-back reasons.

`20260825190000_phase4_rfq_drafts` adds numbered RFQ drafts and restrictive supplier invitation links.

`20260825210000_phase4_commercial_workflow` adds RFQ issue/recommendation/decision states, accountable workflow actors and events, documented supplier quotations and lines, and draft purchase orders. PostgreSQL checks enforce valid transition evidence, mandatory reasons, commercial dates, INR arithmetic, and restrictive source-chain relationships.

`20260903170000_phase5_inventory_foundation` adds scoped inventory locations, draft/post/cancel GRN structures, the immutable stock ledger, and the ledger-derived stock-balance view. Posting is deliberately not enabled while purchase orders are draft-only.

`20260903183000_phase5_inventory_scope_integrity` strengthens site-store scope with a composite site/project foreign key so a location cannot pair a site with the wrong project.

## Transaction numbering

`TransactionNumberService` performs one atomic PostgreSQL upsert/increment with `RETURNING`. It produces values such as `MR-2026-0001` and is safe under concurrency. Calendar year is the Phase 0 default; KDIPL must decide whether numbering resets by Indian financial year.

## Inventory ledger

Inventory balance is derived from the immutable stock-transaction ledger. A mutable `currentStock` field must never become an independent authority. Receipt posting will atomically append ledger entries only after the minimum receivable purchase-order state is confirmed.
