# Phase 13G — Asset & Equipment Management

## Overview
Phase 13G governs company plant, heavy machinery, survey instruments, and vehicles across all active construction sites.

Implemented in:
- Service: [`src/server/enterprise/asset-management-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/asset-management-service.ts)

---

## 1. Asset Tagging & Register
- Equipment Categories: `HEAVY_EARTHMOVING`, `CONCRETE_EQUIPMENT`, `LIFTING_EQUIPMENT`, `POWER_GENERATION`, `SURVEY_TESTING`, and `TRANSPORT_VEHICLE`.
- Tagging: Serial numbers paired with RFID/Barcode references.
- Conditions: `OPERATIONAL`, `STANDBY`, `MAINTENANCE`, `DECOMMISSIONED`.

---

## 2. Straight-Line Depreciation (SLM)
Calculates annual and accumulated depreciation compliant with the Companies Act, 2013:
`Annual Depr = (Capital Cost - Salvage Value) / Useful Life Years`
Maintains live Net Book Value (NBV).

---

## 3. Equipment Utilization & Availability
Computes period operational metrics:
- Utilization Rate: `(Operating Hours / Total Available Hours) * 100`
- Inherent Availability: `((Total Available - Breakdown Hours) / Total Available) * 100`
