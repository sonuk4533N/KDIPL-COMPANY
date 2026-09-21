# Phase 12B — Advanced Reports & Analytics

## Overview

Phase 12B provides the analytical computation engines that transform transactional ERP records into strategic business intelligence.

Implemented in:

- Engine: [`src/server/intelligence/analytics-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/analytics-service.ts)

---

## 1. Project Profitability Intelligence

Computes multi-tier financial performance for every active contract:

- **Direct Costs**: Material consumption + direct labor + equipment rental/fuel + subcontractor measurement bills.
- **Gross Profit**: Billed Client Revenue minus Direct Costs.
- **Overhead Allocation**: Site admin, corporate management, insurance, and financing interest.
- **Net Profit & Margins**: Final margin calculations expressed in both absolute INR and percentage.

$$\text{Gross Margin \%} = \frac{\text{Client Billed} - \text{Direct Costs}}{\text{Client Billed}} \times 100$$
$$\text{Net Profit} = \text{Client Billed} - (\text{Direct Costs} + \text{Overhead})$$

---

## 2. Material Consumption Trend Analysis

- Evaluates period-on-period usage curves for core commodities (TMT Steel, Cement, Ready-Mix Concrete, Sand, Aggregates).
- Computes weighted moving averages to isolate seasonality and multi-shift work surges.
- Categorizes trend direction: `UPWARD`, `STABLE`, or `DOWNWARD`.

---

## 3. Stock Aging & Dead-Stock Elimination

Classifies warehouse inventory into 4 aging tiers:

1. **0–30 Days**: Fast-moving working inventory.
2. **31–60 Days**: Normal replenishment cycle.
3. **61–90 Days**: Slow-moving; triggers recommendation for inter-site material transfers.
4. **90+ Days**: Dead-stock; flags items for salvage, vendor return, or scrap auction to prevent capital lockup.

---

## 4. Wastage & Scrap Variance Analysis

Compares theoretical engineering consumption (based on structural drawings and BOQ) against physical actual consumption:

- Permissible wastage tolerances (e.g. 3% for TMT steel cut pieces; 2% for bulk cement).
- Flags excessive consumption (`EXCESSIVE` vs `WITHIN_LIMIT`) to trigger forensic site audits.

---

## 5. Payment Aging Matrix

Aggregates supplier liabilities across aging brackets:

- Not Yet Due (within agreed credit terms)
- 1–30 Days Overdue
- 31–60 Days Overdue
- 61–90 Days Overdue
- 90+ Days Overdue (critical vendor dispute risk)
