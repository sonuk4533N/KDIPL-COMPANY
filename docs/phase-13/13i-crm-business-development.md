# Phase 13I — Customer & Business Development Expansion (CRM)

## Overview
Phase 13I manages the public and private tender bidding lifecycle, opportunity valuation, probability weighting, and automated project conversion upon contract award.

Implemented in:
- Service: [`src/server/enterprise/crm-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/crm-service.ts)

---

## 1. Tender Pipeline Stages & Probabilities
- `LEAD_IDENTIFIED`: 10%
- `PRE_QUALIFICATION`: 30%
- `BID_SUBMISSION`: 60%
- `TECHNICAL_FINANCIAL_OPENING`: 80%
- `AWARDED_WON`: 100%
- `LOST`: 0%

---

## 2. Automated Project Conversion Factory
`convertOpportunityToProject()` seamlessly converts an awarded tender into a live project blueprint:
- Generates unique project code (`PRJ-...`).
- Computes baseline procurement budget from sanctioned contract value minus targeted bid gross margin.
