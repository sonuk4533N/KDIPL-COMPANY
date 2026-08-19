# KDIPL Phase 0 Architecture Review

## Repository baseline

- `KDIPL COMPANY` is an empty workspace and is not derived from the older
  `WEB PROJECTS/kdipl` implementation.
- The older implementation is reference-only because it already contains ERP
  workflows that are explicitly outside Phase 0 and uses JWT authentication
  rather than the approved database-session architecture.

## Governing decisions

- The explicit Phase 0 brief governs scope over Pass 4's older
  architecture-only phase map.
- Use one Next.js App Router application with server-side application services,
  PostgreSQL, Prisma, Zod, and strict TypeScript.
- Implement only minimal email/password authentication, opaque database
  sessions, foundational organization/RBAC data, and reusable infrastructure.
- Use the approved Pass 2/3 sidebar shell. The six generated HTML references
  supply typography and component styling but their top-navigation layout does
  not override the written sidebar requirement.
- Preserve future inventory authority as an immutable transaction ledger; do
  not introduce inventory business models in Phase 0.

## Known unresolved business decisions

Approval thresholds, detailed role grants, segregation-of-duty exceptions,
emergency purchasing, quotation requirements, GST/accounting treatment,
negative-stock overrides, stock-adjustment authority, transfer discrepancies,
project closure, document retention, production hosting/storage, backup and
monitoring policies, audit retention, and financial-year transaction numbering
remain subject to KDIPL approval. Phase 0 must not encode these as final rules.

## Phase boundary

Phase 0 delivers the working engineering foundation, protected application
shell, verification suite, and documentation. It does not implement Projects,
Sites, Material Requirements, approvals, procurement, purchases, receiving,
inventory, issues, transfers, accounts, or reporting workflows.
