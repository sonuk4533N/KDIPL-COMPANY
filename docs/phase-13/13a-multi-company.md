# Phase 13A — Multi-Company Foundation

## Overview
Phase 13A establishes the multi-legal-entity foundation for KDIPL. It allows the platform to govern multiple distinct corporate entities while maintaining strict legal isolation, separate document sequence numbers, entity-specific tax credentials (GSTIN/PAN/CIN), user access scopes, and group consolidated management rollups with inter-company transaction elimination.

Implemented in:
- Service: [`src/server/enterprise/multi-company-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/multi-company-service.ts)
- Console: [`src/app/(app)/enterprise/page.tsx`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/app/%28app%29/enterprise/page.tsx)
- Tests: [`tests/unit/phase13-enterprise.test.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/tests/unit/phase13-enterprise.test.ts)

---

## 1. Registered Corporate Entities
1. **KDIPL (Parent Entity)**: *Kumar Designers & Infra Projects Limited* (CIN: U45200DL2012PLC234567, GSTIN: 07AAACK1234D1Z5).
2. **KDINFRA (EPC Sub)**: *KD Infra Engineering Private Limited* (CIN: U45203DL2018PTC345678, GSTIN: 07AABCK5678E1Z8).
3. **KDCON (Concessions)**: *KD Highway Concessions Limited* (CIN: U45204HR2020PLC089123, GSTIN: 06AACCK9012F1Z1).
4. **KDEQUIP (Heavy Plant)**: *KD Heavy Plant & Logistics Private Limited* (CIN: U71290UP2021PTC145679, GSTIN: 09AADCK3456G1Z4).

---

## 2. Core Architectural Capabilities
- **Multi-Tenant Context Resolution**: `resolveCompanyContext()` enforces authorized company scopes. Executives can access all companies or enter group-wide consolidated reporting mode.
- **Company-Specific Document Numbering**: `generateCompanyDocumentNumber()` formats compliant numbers (e.g. `KDIPL-PO-2627-00042`, `KDINFRA-INV-2627-00001`).
- **Data Isolation Scopes**: `getCompanyIsolationScope()` provides parameterized where clauses ensuring tenant queries never leak across corporate boundaries.
- **Consolidated Financial Rollup**: `consolidateGroupFinancials()` automatically eliminates inter-company receivables and payables to avoid double counting across the corporate group.
