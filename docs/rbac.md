# Role-Based Access Control

Authorization combines a named permission with project/site assignment scope. UI visibility is convenience only; server checks are authoritative.

## Initial roles

Managing Director, Project Director, Business Development Director, Project Manager, Purchase Manager, Accounts, Site Supervisor, Store Keeper, and System Administrator are seeded. The bootstrap System Administrator receives the catalog so Phase 1 administration is usable. Confirmed Phase 3 requirement grants are seeded for Site Supervisor, Project Manager, and Project Director. Phase 4 sourcing grants give the Purchase Manager `purchase.view` and `purchase.create`; Project Directors receive `purchase.view` and `purchase.approve` for independent decisions. Phase 5 grants Store Keepers `inventory.view` and `inventory.receive` with organization-wide store scope, and grants Site Supervisors the same permissions only for direct receipts and visibility at actively assigned site stores. Phase 6 adds issue and transfer duties for Store Keepers and assigned Site Supervisors, plus `inventory.adjust` for Store Keepers and Project Directors. System Administrators retain support visibility but are rejected by operational and approval commands.

Phase 1 supports multiple roles per user. Role assignments and permission-grant
changes are audited and invalidate affected sessions. KDIPL system role codes
and active status are protected; custom roles can be created and deactivated.

## Development business accounts

When `DEMO_BUSINESS_PASSWORD` is set during `db:seed`, the seed creates or
refreshes five active, employee-linked accounts with that shared development
password. Do not configure this variable in production.

| Role             | Email                       | Data scope                                                                       |
| ---------------- | --------------------------- | -------------------------------------------------------------------------------- |
| Project Director | project.director@kdipl.test | Organization-wide requirements, procurement, inventory, and adjustment decisions |
| Project Manager  | project.manager@kdipl.test  | Assigned projects                                                                |
| Purchase Manager | purchase.manager@kdipl.test | Organization-wide sourcing                                                       |
| Site Supervisor  | site.supervisor@kdipl.test  | Assigned sites and their site stores                                             |
| Store Keeper     | store.keeper@kdipl.test     | Organization-wide receiving and stock movements                                  |

Primary and mobile navigation is filtered from the authenticated permission
set. Business action controls also require the designated business role, so the
System Administrator retains support visibility without being offered
requirement, commercial, PO, or receiving actions.

## Permission catalog

Permissions use `resource.action`. Phase 2 adds project assignment, site view/create/update, catalog view/manage, and supplier view/manage to the existing project, transaction, reporting, audit, and administration catalog. Phase 3 uses `material_requirement.view`, `material_requirement.create`, and `material_requirement.approve`; permission alone never replaces live assignment, role, state, or separation-of-duties checks.

| Role                          | Expected scope (not yet granted)                                     | Unresolved authority                          |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Managing Director             | Organization-wide read, approvals, reports                           | Exact write and threshold permissions         |
| Project Director              | Requirement, RFQ, and stock-adjustment decisions                     | Future thresholds and delegated authority     |
| Business Development Director | Future business-development scope                                    | Module definition                             |
| Project Manager               | Assigned projects/sites and requirement review                       | Future procurement authority                  |
| Purchase Manager              | RFQ issue, quotation capture, and recommendation                     | Must not approve supplier recommendations     |
| Accounts                      | Invoice verification and financial reporting                         | Payments and GST authority                    |
| Site Supervisor               | Assigned sites, receipt, issue acknowledgment, and transfer receipt  | Transfer discrepancy authority                |
| Store Keeper                  | Organization-wide receiving, issue, transfer, and adjustment posting | Physical-count authority                      |
| System Administrator          | Technical administration                                             | Must not imply unrestricted business approval |

`canAccessProject` and `canAccessSite` deny by default and resolve active employee assignments from PostgreSQL. Project-level assignments expose the project's sites; site-only assignments expose the parent context and only assigned sites. Project Directors receive organization-wide requirement, RFQ, and adjustment visibility for confirmed approval duties. The System Administrator bypass remains limited to technical administration and is explicitly rejected for requirement, commercial, and stock-movement decisions. A creator or submitter cannot decide their own controlled adjustment.
