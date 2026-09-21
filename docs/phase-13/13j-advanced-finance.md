# Phase 13J — Advanced Financial Architecture

## Overview
Phase 13J structures double-entry financial accounting, multi-tier Chart of Accounts (CoA), cost centers, and financial period locking.

Implemented in:
- Service: [`src/server/enterprise/advanced-finance-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/advanced-finance-service.ts)

---

## 1. Chart of Accounts & Cost Centers
- 5 Account Classes: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.
- Cost Center Tagging: Every transaction is allocated to a specific Project, Site, or Corporate Department.

---

## 2. Double-Entry Journal Validation
`validateDoubleEntryJournal()` verifies:
- Minimum of 2 lines.
- Zero variance between sum of debits and sum of credits: `Math.abs(Debit - Credit) <= 0.01`.

---

## 3. Financial Period Controls
- `OPEN`: Posting allowed.
- `SOFT_LOCKED`: Posting requires Finance Director sign-off.
- `HARD_LOCKED`: Year-end / quarter-end closed. Rejects any back-dated posting attempt.
