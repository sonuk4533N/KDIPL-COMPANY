# Phase 13B — Multi-Project & Multi-Site Scaling

## Overview
Phase 13B implements regional hierarchy, multi-store support per project, and inter-project material logistics.

Implemented in:
- Service: [`src/server/enterprise/multi-project-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/multi-project-service.ts)

---

## 1. Regional Organization & Store Hierarchy
- Operational Regions: `NORTH`, `SOUTH`, `EAST`, `WEST`, and `CENTRAL`.
- Specialized Store Types:
  - `CENTRAL_WAREHOUSE`
  - `MAIN_PROJECT_STORE`
  - `SUB_STORE_ELECTRICAL`
  - `SUB_STORE_CIVIL`
  - `HAZARDOUS_CHEMICAL_STORE`
  - `OPEN_YARD`
  - `SCRAP_DISPOSAL_YARD`

---

## 2. Inter-Project Stock Transfers
Lifecycle workflow:
`REQUESTED → APPROVED_SOURCE → DISPATCHED (GATE PASS ISSUED) → IN_TRANSIT → RECEIVED (QC VERIFICATION) → COMPLETED`
Transit losses are recorded and isolated to prevent inventory reconciliation mismatches.

---

## 3. Cross-Project Surplus Allocation
The `evaluateCrossProjectSurplus()` algorithm identifies projects holding surplus material (>2.5x safety stock) and matches them with projects in deficit (<1.0x safety stock), recommending inter-site reallocations that eliminate external purchasing costs.
