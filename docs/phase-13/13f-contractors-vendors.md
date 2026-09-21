# Phase 13F — Contractor & Vendor Management

## Overview
Phase 13F provides contractor pre-qualification, work order tracking, Running Account (RA) bill processing with statutory withholdings, and contractor performance scorecards.

Implemented in:
- Service: [`src/server/enterprise/contractor-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/contractor-service.ts)

---

## 1. Running Account (RA) Bill Deductions Engine
The `processRunningAccountBill()` function applies contractual and statutory deductions:
1. **Retention Money**: 5% of gross bill value held until defect liability period.
2. **TDS under Sec 194C**:
   - 1% for Individual / Sole Proprietor contractors.
   - 2% for Corporate / LLP entities.
3. **Mobilization Advance Recovery**: Amortized recovery against bill value until advance is fully liquidated.
4. **Compliance Withholding**: Automatically holds 10% of bill value if statutory Labour License has expired.

---

## 2. Contractor Performance Scorecard
Weighted evaluation across three pillars:
- Quality Score: 40%
- Schedule Compliance: 40%
- Safety & HSE Score: 20%
Assigns contractor tiers: `TIER_1_PREFERRED`, `TIER_2_APPROVED`, `TIER_3_PROBATION`, or `BLOCKED`.
