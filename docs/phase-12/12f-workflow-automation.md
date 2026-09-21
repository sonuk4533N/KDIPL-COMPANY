# Phase 12F — Workflow Automation & Event Alerts

## Overview

Phase 12F automates repetitive operational monitoring and notifications across project sites, procurement teams, warehouse stores, and accounts departments.

Implemented in:

- Engine: [`src/server/intelligence/workflow-automation-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/workflow-automation-service.ts)

---

## 1. Automated Workflow Triggers

| Trigger Code                     | Condition                                                                  | Target Role         | Automated Action                                                    |
| -------------------------------- | -------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| **APPROVAL_REMINDER**            | Requisition or PO pending approval for $\ge 24$ hours.                     | Approver / Director | Escalation notification with deep link to approval workspace.       |
| **OVERDUE_PO**                   | Purchase order unfulfilled beyond agreed delivery date.                    | Purchase Manager    | Alert generated with vendor contact and delay duration.             |
| **DELAYED_GRN**                  | Materials arrived at site gate pass $> 4$ hours ago without QC inspection. | Stores Manager      | QC inspection reminder to avoid delaying truck release.             |
| **LOW_STOCK**                    | Stock level drops to or below minimum safety stock.                        | Purchase Manager    | Broadcast alert to source replenishment materials immediately.      |
| **PAYMENT_REMINDER**             | Vendor payment voucher maturing within 3 days or overdue.                  | Accounts Admin      | Prepares payment batch and alerts cash flow controller.             |
| **PENDING_INVOICE_VERIFICATION** | Supplier invoice pending 3-way match for $\ge 24$ hours.                   | Accounts Officer    | Flags invoice to prevent credit term expiration.                    |
| **PROJECT_CLOSE_REMINDER**       | Project marked 100% physically complete with open POs or inventory.        | Project Director    | Audit checklist generated to clear balances before formal handover. |
