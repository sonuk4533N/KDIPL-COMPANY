# Phase 12C — Budget & Cost Control

## Overview

Phase 12C enforces pre-commit cost controls, continuous variance monitoring, and multi-tier approval thresholds across all project procurement.

Implemented in:

- Engine: [`src/server/intelligence/budget-control-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/budget-control-service.ts)

---

## 1. Budget Categories

Budgets are tracked across seven discrete expenditure categories:

1. `CIVIL_STRUCTURE`
2. `STEEL_REINFORCEMENT`
3. `CEMENT_MASONRY`
4. `ELECTRICAL_PLUMBING`
5. `LABOR_CONTRACT`
6. `PLANT_MACHINERY`
7. `ADMIN_OVERHEAD`

---

## 2. Total Cost Exposure Formula

The platform monitors committed and actual costs in real-time:

$$\text{Total Exposure} = \text{Actual Incurred Cost} + \text{Committed Cost (Open POs / Work Orders)}$$
$$\text{Available Balance} = \text{Sanctioned Budget} - \text{Total Exposure}$$
$$\text{Consumption \%} = \frac{\text{Total Exposure}}{\text{Sanctioned Budget}} \times 100$$

---

## 3. Threshold Governance & Automated Locks

| Consumption Range  | Status              | Enforcement Action                                                                                                                    |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **0% – 79.9%**     | `NORMAL`            | Standard requisition and purchase order approval flows.                                                                               |
| **80.0% – 89.9%**  | `APPROACHING_LIMIT` | System logs advisory warnings on all new indents in this category.                                                                    |
| **90.0% – 100.0%** | `APPROACHING_LIMIT` | Purchase orders require explicit notification to the Project Director.                                                                |
| **> 100.0%**       | `EXCEEDED`          | **Hard Lock**: Automated procurement block. New POs cannot be released without Managing Director override and formal budget revision. |
