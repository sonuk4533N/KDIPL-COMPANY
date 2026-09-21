# Phase 12J — Advanced Audit & Governance

## Overview

Phase 12J equips executive management and compliance teams with proactive forensic heuristics to identify fraud, approval bypass attempts, and operational anomalies.

Implemented in:

- Engine: [`src/server/intelligence/governance-audit-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/governance-audit-service.ts)

---

## 1. Automated Governance Heuristics

| Anomaly Type                       | Heuristic Rule                                                                    | Severity            | Alert Action                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------ |
| **UNUSUAL_HOURS_ACTIVITY**         | Transactions created between 22:00 and 05:00 IST.                                 | `MEDIUM`            | Flags transaction for compliance review.               |
| **HIGH_VALUE_TRANSACTION**         | Financial commitments or payments $\ge$ ₹5,00,000 (Critical if $\ge$ ₹20,00,000). | `HIGH` / `CRITICAL` | Enforces two-tier executive verification.              |
| **APPROVAL_BYPASS_ATTEMPT**        | Out-of-sequence status mutation attempts.                                         | `CRITICAL`          | Immediate lock and security audit event.               |
| **REPEATED_INVENTORY_ADJUSTMENT**  | $\ge 3$ manual stock write-offs by the same user within 7 days.                   | `HIGH`              | Flags potential shrinkage or inventory tampering.      |
| **INVENTORY_DISCREPANCY_VARIANCE** | Physical stock count variance $> 2.0\%$ (Critical if $> 5.0\%$).                  | `HIGH` / `CRITICAL` | Triggers Director-mandated physical recount.           |
| **UNREGISTERED_VENDOR_SPIKE**      | Unregistered or cash purchases exceeding monthly departmental limits.             | `MEDIUM`            | Requires Accounts Head sign-off for RCM tax liability. |

---

## 2. Exportable Audit Ledger

- Immutable event logs containing actor user ID, timestamp, IP address, previous state, and mutated state.
- Complies with statutory retention guidelines (Companies Act 2013, Section 128).
