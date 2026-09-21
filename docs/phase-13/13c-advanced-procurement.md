# Phase 13C — Advanced Procurement

## Overview
Phase 13C delivers enterprise procurement controls: Annual Procurement Planning (APP), long-term Rate Contracts (RC), phased delivery lot scheduling, and tiered financial approval matrix enforcement.

Implemented in:
- Service: [`src/server/enterprise/advanced-procurement-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/advanced-procurement-service.ts)

---

## 1. Procurement Approval Matrix
Enforces organizational authority limits:
- **Up to ₹50,000**: `SITE_SUPERVISOR` (Routine site petty & minor consumables)
- **Up to ₹5,00,000**: `PURCHASE_MANAGER` (Operational POs)
- **Up to ₹25,00,000**: `PROJECT_DIRECTOR` (Major material packages)
- **Above ₹25,00,000**: `MANAGING_DIRECTOR` (Board-level capital expenditure)

---

## 2. Rate Contracts (RC)
Fixed-price supplier agreements with ceiling quantities and validity windows. Orders are validated against:
- Contract status (`ACTIVE`)
- Validity start and end dates
- Cumulative ordered quantity vs contract ceiling limit

---

## 3. Phased Bulk Delivery Scheduling
`generatePhasedSchedule()` splits bulk purchase commitments into staggered delivery lots with pre-set intervals, supporting JIT (Just-In-Time) inventory arrival at construction sites.
