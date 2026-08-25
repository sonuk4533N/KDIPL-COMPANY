# Role-Based Access Control

Authorization combines a named permission with project/site assignment scope. UI visibility is convenience only; server checks are authoritative.

## Initial roles

Managing Director, Project Director, Business Development Director, Project Manager, Purchase Manager, Accounts, Site Supervisor, Store Keeper, and System Administrator are seeded. The bootstrap System Administrator receives the catalog so Phase 1 administration is usable. All non-administrator grants still require KDIPL approval.

Phase 1 supports multiple roles per user. Role assignments and permission-grant
changes are audited and invalidate affected sessions. KDIPL system role codes
and active status are protected; custom roles can be created and deactivated.

## Permission catalog

Permissions use `resource.action`. Phase 2 adds project assignment, site view/create/update, catalog view/manage, and supplier view/manage to the existing project, transaction, reporting, audit, and administration catalog. Phase 3 draft requirements use `material_requirement.view` and `material_requirement.create`; the existing approval permission remains unused until the approval policy is confirmed.

| Role                          | Expected scope (not yet granted)               | Unresolved authority                          |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Managing Director             | Organization-wide read, approvals, reports     | Exact write and threshold permissions         |
| Project Director              | Project oversight and approvals                | Limits and assignment scope                   |
| Business Development Director | Future business-development scope              | Module definition                             |
| Project Manager               | Assigned projects/sites and requirement review | Approval/self-approval rules                  |
| Purchase Manager              | Procurement and supplier operations            | Purchase approval limits                      |
| Accounts                      | Invoice verification and financial reporting   | Payments and GST authority                    |
| Site Supervisor               | Assigned sites and own requirements            | Receipt/acknowledgement rules                 |
| Store Keeper                  | Receiving, issue, transfer, count              | Adjustment authority and finance visibility   |
| System Administrator          | Technical administration                       | Must not imply unrestricted business approval |

`canAccessProject` and `canAccessSite` now deny by default and resolve active employee assignments from PostgreSQL. Project-level assignments expose the project's sites; site-only assignments expose the parent context and only assigned sites. The System Administrator bypass remains limited to technical administration and must not be interpreted as business approval authority.
