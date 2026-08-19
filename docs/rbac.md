# Role-Based Access Control

Authorization combines a named permission with future project/site assignment scope. UI visibility is convenience only; server checks are authoritative.

## Initial roles

Managing Director, Project Director, Business Development Director, Project Manager, Purchase Manager, Accounts, Site Supervisor, Store Keeper, and System Administrator are seeded. Only the bootstrap System Administrator receives Phase 0 grants. All other grants require KDIPL approval.

## Permission catalog

Permissions use `resource.action`, including project view/create/update, material-requirement view/create/approve, purchase view/create/approve, inventory view/receive/issue/transfer/adjust, invoice view/verify, report view/export, notifications, audit visibility, and user/role management.

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

`canAccessProject` and `canAccessSite` default to denial until assignment models exist. The bootstrap administrator bypass exists only to establish the foundation and must be revisited with Phase 1 policy.
