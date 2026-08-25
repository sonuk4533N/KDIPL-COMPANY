# Role-Based Access Control

Authorization combines a named permission with project/site assignment scope. UI visibility is convenience only; server checks are authoritative.

## Initial roles

Managing Director, Project Director, Business Development Director, Project Manager, Purchase Manager, Accounts, Site Supervisor, Store Keeper, and System Administrator are seeded. The bootstrap System Administrator receives the catalog so Phase 1 administration is usable. Confirmed Phase 3 requirement grants are seeded for Site Supervisor, Project Manager, and Project Director. Phase 4 draft-only sourcing grants are seeded for Purchase Manager; issue, award, approval, and purchase-order authority remain ungranted.

Phase 1 supports multiple roles per user. Role assignments and permission-grant
changes are audited and invalidate affected sessions. KDIPL system role codes
and active status are protected; custom roles can be created and deactivated.

## Permission catalog

Permissions use `resource.action`. Phase 2 adds project assignment, site view/create/update, catalog view/manage, and supplier view/manage to the existing project, transaction, reporting, audit, and administration catalog. Phase 3 uses `material_requirement.view`, `material_requirement.create`, and `material_requirement.approve`; permission alone never replaces live assignment, role, state, or separation-of-duties checks.

| Role                          | Expected scope (not yet granted)               | Unresolved authority                          |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Managing Director             | Organization-wide read, approvals, reports     | Exact write and threshold permissions         |
| Project Director              | Organization-wide requirement oversight        | Future thresholds and delegated authority     |
| Business Development Director | Future business-development scope              | Module definition                             |
| Project Manager               | Assigned projects/sites and requirement review | Future procurement authority                  |
| Purchase Manager              | Organization-wide RFQ draft sourcing           | Issue, award, PO, and approval authority      |
| Accounts                      | Invoice verification and financial reporting   | Payments and GST authority                    |
| Site Supervisor               | Assigned sites and requirement submission      | Receipt/acknowledgement rules                 |
| Store Keeper                  | Receiving, issue, transfer, count              | Adjustment authority and finance visibility   |
| System Administrator          | Technical administration                       | Must not imply unrestricted business approval |

`canAccessProject` and `canAccessSite` deny by default and resolve active employee assignments from PostgreSQL. Project-level assignments expose the project's sites; site-only assignments expose the parent context and only assigned sites. Project Directors receive organization-wide requirement visibility for their confirmed approval duty. The System Administrator bypass remains limited to technical administration and is explicitly rejected for requirement business decisions.
