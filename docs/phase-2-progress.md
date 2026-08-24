# Phase 2 — Project & Master Data Foundation

Phase 2 implements the approved foundation for controlled project operations. It uses the Pass 4 engineering specification as the behavioral authority and the supplied Superdesign exports as composition references only.

## Delivered

- Relational clients, projects, sites, project assignments, and site assignments.
- Assignment-backed project/site visibility with server-side permission checks.
- Explicit, guarded project and site status transitions.
- Responsive project portfolio, project detail, site management, and team management screens.
- Material categories, units of measure, materials, suppliers, and primary contacts.
- Responsive master-data management with inline validation, empty states, status controls, and permission-gated mutations.
- Atomic audit logging for every Phase 2 create, update, status, assignment, and activation change.
- Reviewed PostgreSQL constraints, idempotent reference/demo seeds, and focused unit/integration coverage.

## Deliberately deferred

Material requirements, quotations, purchase orders, goods receipts, stock balances and movement, invoices/payables, payments, transaction reports, supplier performance, project budgets, and material consumption remain later-phase work. Phase 2 screens do not invent those values from mock designs.

## Engineering defaults to confirm before later phases

- Material minimum/reorder values are organization-wide defaults until per-store policy is approved.
- Project completion and cancellation are terminal, and require all sites to be closed first.
- Non-administrator project creators receive a project-member assignment so their newly created record remains visible.
- Only one active primary manager, supervisor, and supplier contact is allowed; additional non-primary assignments remain supported.
