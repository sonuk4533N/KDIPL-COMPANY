# Phase 12A — Advanced Management Dashboards

## Overview

Phase 12A introduces role-tailored Executive & Operational Cockpits across the enterprise. Rather than presenting a generic view, the dashboard dynamically adapts to the authenticated principal's organizational authority and responsibilities.

Implemented in:

- Service: [`src/server/intelligence/dashboard-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/dashboard-service.ts)
- Interface: [`src/app/(app)/dashboard/page.tsx`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/app/%28app%29/dashboard/page.tsx)

---

## 1. Role-Specific Cockpits

### 1. Managing Director (MD) Cockpit

- **Focus**: High-level financial exposure, liquidity runway, group profitability, pending executive approvals.
- **Key Cards**:
  - Enterprise Contractual Exposure (₹184.5M)
  - Cash Flow Runway (42 Days)
  - Critical Approvals Requiring MD Sign-off
  - Active Construction Sites Status

### 2. Project Director Cockpit

- **Focus**: Cross-site physical progress, milestone variances, critical material shortages, subcontractor commitment.
- **Key Cards**:
  - Weighted Milestone Completion Rate
  - Pending Engineering Indents
  - Critical Material Risk Alerts (Sites below 48h safety stock)
  - Committed Subcontract Value

### 3. Project Manager Cockpit

- **Focus**: Site-specific budget burn, daily work progress logs, local stock availability, open indents.
- **Key Cards**:
  - Project Budget Burn %
  - Open Requisitions awaiting procurement
  - Daily Labor & Measurement Log Status
  - Site Warehouse Stock Valuation

### 4. Purchase Manager Dashboard

- **Focus**: Sourcing velocity, RFQ turnaround, vendor price volatility, on-time delivery rate.
- **Key Cards**:
  - Open Indents to Source
  - Pending PO Sign-offs
  - On-Time Vendor Delivery Rate (OTIF)
  - Monthly Purchasing Volume

### 5. Stores Manager Dashboard

- **Focus**: Warehouse material control, physical stock valuation, in-transit stock, pending GRN QC inspections.
- **Key Cards**:
  - Total Physical Stock Valuation
  - Pending GRN Gate Pass Inspections
  - Low Stock Items (ROP Triggered)
  - In-Transit Material Dispatches

### 6. Accounts Head Cockpit

- **Focus**: 3-Way match queues, disbursement maturity, GST input credit reconciliation, Tally sync health.
- **Key Cards**:
  - Pending 3-Way Invoice Verifications
  - Disbursements Awaiting Release
  - Reconciled GST Input Tax Credit (ITC)
  - TallyPrime Synchronization Status

### 7. Business Development (BD) Dashboard

- **Focus**: Tendering pipeline, bid win ratio, client retention receivables, pre-qualification readiness.
- **Key Cards**:
  - Active Tender Pipeline Value (₹450M)
  - Commercial Bid Win Ratio
  - Client Retention Receivables Maturing in 90 Days
  - Solvency & Machinery Pre-Qualification Readiness

---

## 2. Real-Time Pending Approvals Queue

Aggregates all items requiring action from the current user:

- Requisition Indents awaiting review
- Purchase Orders awaiting rate authorization
- Supplier Invoices in 3-way match tolerance check
- Payment Vouchers ready for NEFT/RTGS release

Each queue item indicates:

- Document Code & Type
- Submitting Persona & Date
- Value / Quantity
- Urgency Badge (`NORMAL`, `HIGH`, `CRITICAL` with pulse animation)
- Direct deep-link to the approval workspace

---

## 3. Project-Wise Financial & Physical Position Matrix

A live comparative ledger displaying all active projects:

- **Sanctioned Budget**: Baseline capital approved.
- **Actual Spent**: Posted disbursements and direct material issues.
- **Committed Cost**: Active POs and approved work orders not yet invoiced.
- **Site Stock**: Live valuation of on-site inventory.
- **Physical Progress**: Percentage completed based on site measurement sheets.
- **Financial Burn**: Incurred cost vs total sanctioned budget with threshold warning indicators (`ON_TRACK`, `WARNING`, `CRITICAL`).
