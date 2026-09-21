# Phase 13H — Maintenance Management

## Overview
Phase 13H provides preventive maintenance scheduling, breakdown ticket workflows, spare parts consumption tracking, and equipment reliability engineering.

Implemented in:
- Service: [`src/server/enterprise/maintenance-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/enterprise/maintenance-service.ts)

---

## 1. Breakdown Ticketing & Resolution
- Types: `PREVENTIVE`, `BREAKDOWN`, `OVERHAUL`, `CALIBRATION`.
- Severities: `CRITICAL` (Site stoppage), `MAJOR`, `MINOR`.
- Tallies spare parts consumed from stores inventory and technician labor costs.

---

## 2. Reliability Metrics (MTBF & MTTR)
- **Mean Time Between Failures (MTBF)**:
  `Total Operating Hours / Breakdown Count`
- **Mean Time To Repair (MTTR)**:
  `Total Downtime Hours / Breakdown Count`
- **Inherent Availability**:
  `[MTBF / (MTBF + MTTR)] * 100`
- Categorizes equipment status: `OPTIMAL`, `ATTENTION_REQUIRED`, or `HIGH_MAINTENANCE_BURDEN`.
