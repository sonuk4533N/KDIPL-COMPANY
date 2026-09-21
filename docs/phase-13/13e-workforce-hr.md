# Phase 13E — HR & Workforce Management

## Overview
Phase 13E covers site workforce deployment, daily muster roll attendance, leave ledger calculations, statutory compliance verification, and payroll-ready computations.

Implemented in:
- Service: [`src/server/enterprise/workforce-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/workforce-service.ts)

---

## 1. Daily Site Muster Roll & Attendance
- States: `PRESENT`, `ABSENT`, `HALF_DAY`, `ON_LEAVE`, `OVERTIME`.
- Tracks standard duty hours and overtime hours linked to specific construction sites.

---

## 2. Leave Ledger
- Supports `CASUAL`, `SICK`, and `PRIVILEGE` leaves.
- Deducts approved days and prevents negative balances.

---

## 3. Statutory Payroll Computation
- Computes earned basic salary based on attendance.
- Automatically calculates 40% HRA and site deployment allowances.
- Computes statutory withholdings:
  - Provident Fund (PF): 12% on basic salary (statutory ceiling applied).
  - Employees' State Insurance (ESI): 0.75% for eligible wage tiers.
  - Tax Deducted at Source (TDS).
