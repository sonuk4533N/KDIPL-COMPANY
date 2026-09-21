# Phase 13K — Enterprise Governance

## Overview
Phase 13K enforces organization-wide governance, Segregation of Duties (SoD), and time-bounded Delegation of Authority (DoA).

Implemented in:
- Service: [`src/server/enterprise/enterprise-governance-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/enterprise-governance-service.ts)

---

## 1. Segregation of Duties (SoD)
Prevents conflicting actions:
1. **Purchase Commitment**: PO Initiator cannot approve their own PO (`CREATOR_AS_APPROVER`).
2. **Material Acceptance vs Payment**: Goods inward inspector cannot approve disbursements (`RECEIVER_AS_APPROVER`).
3. **Invoice Processing**: Invoice entry clerk cannot sign payment vouchers (`BILL_MAKER_AS_DISBURSER`).

---

## 2. Delegation of Authority (DoA)
Supports temporary proxy delegations during executive travel or leave:
- Valid date window (`startsAt` to `endsAt`).
- Strict ceiling threshold (`maxApprovalLimitINR`).
- Rejects any transaction exceeding the delegated limit.
