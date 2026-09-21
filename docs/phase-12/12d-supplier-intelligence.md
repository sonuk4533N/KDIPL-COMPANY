# Phase 12D — Supplier Intelligence & Performance Scorecards

## Overview

Phase 12D provides objective, algorithmically computed supplier scorecards, delivery reliability metrics, and preferred vendor ranking.

Implemented in:

- Engine: [`src/server/intelligence/supplier-intelligence-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/supplier-intelligence-service.ts)

---

## 1. Scorecard Metrics

### 1. On-Time In-Full (OTIF) Delivery Rate

Measures the percentage of purchase orders where the full quantity was delivered on or before the agreed delivery date:
$$\text{OTIF \%} = \frac{\text{Orders Delivered On-Time \& In-Full}}{\text{Total Orders Issued}} \times 100$$

### 2. Quality Acceptance & Rejection Rates

Derived from physical Goods Receipt Note (GRN) quality inspection logs:
$$\text{Quality Acceptance \%} = \frac{\text{Accepted Quantity}}{\text{Total Received Quantity}} \times 100$$
$$\text{Rejection Rate \%} = \frac{\text{Rejected / Damaged Quantity}}{\text{Total Received Quantity}} \times 100$$

### 3. Composite Scoring Algorithm (0 – 100 Scale)

A weighted formula balancing delivery punctuality, material quality, and fulfillment completeness:
$$\text{Composite Score} = (0.40 \times \text{OTIF \%}) + (0.40 \times \text{Quality Acceptance \%}) + (0.20 \times \text{Fulfillment Ratio \%})$$

---

## 2. Supplier Tiering Matrix

| Tier                   | Minimum Score                  | Criteria                                                                                                       |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **PLATINUM_PREFERRED** | $\ge 90.0$                     | Zero active risk indicators, rejection rate $< 2.0\%$, OTIF $\ge 95\%$. Eligible for rate contract extensions. |
| **GOLD_RELIABLE**      | $80.0 – 89.9$                  | Consistent supplier with acceptable delivery performance. Standard RFQ inclusion.                              |
| **SILVER_MONITORED**   | $60.0 – 79.9$                  | Moderate delivery delays or occasional quality variance. Requires secondary vendor quote backup.               |
| **RISK_SUSPENDED**     | $< 60.0$ or $> 10\%$ rejection | High rejection rate or severe delivery defaults. Automated lock on new PO issuance.                            |
