# Phase 13D — Advanced Project Cost Management

## Overview
Phase 13D introduces Earned Value Management (EVM), 4-category cost segregation, and dynamic Cost-to-Complete (CTC) forecasting.

Implemented in:
- Service: [`src/server/enterprise/project-cost-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/project-cost-service.ts)

---

## 1. Earned Value Management (EVM)
- **Budget At Completion (BAC)**: Approved baseline project budget.
- **Planned Value (PV)**: Value of work scheduled to date.
- **Earned Value (EV)**: Value of work physically accomplished.
- **Actual Cost (AC)**: Incurred expenditures and disbursements.
- **Cost Variance (CV = EV - AC)**: Favorable when positive.
- **Schedule Variance (SV = EV - PV)**: Ahead of schedule when positive.
- **Cost Performance Index (CPI = EV / AC)**: Efficiency ratio.
- **Schedule Performance Index (SPI = EV / PV)**: Schedule velocity ratio.
- **Cost-to-Complete (CTC)**: Forecast remaining expenditure: `(BAC - EV) / CPI`.
- **Estimate at Completion (EAC)**: `AC + CTC`.
- **Variance at Completion (VAC)**: `BAC - EAC`.

---

## 2. 4-Category Cost Breakdown
Real-time cost tracking and variance analysis across:
1. `MATERIAL`
2. `LABOUR`
3. `PLANT_EQUIPMENT`
4. `SUBCONTRACTOR` & `SITE_OVERHEAD`
