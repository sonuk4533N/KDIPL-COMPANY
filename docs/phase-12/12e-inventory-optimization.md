# Phase 12E — Inventory Optimization & Replenishment

## Overview

Phase 12E introduces dynamic inventory parameters to prevent project downtime caused by stockouts while eliminating excessive capital tied up in slow-moving materials.

Implemented in:

- Engine: [`src/server/intelligence/inventory-optimization-service.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/inventory-optimization-service.ts)

---

## 1. Algorithmic Inventory Parameters

### Safety Stock (Buffer Stock)

Buffers against unexpected site consumption spikes or supplier lead-time delays:
$$\text{Safety Stock} = (\text{Max Daily Usage} \times \text{Max Lead Time}) - (\text{Avg Daily Usage} \times \text{Avg Lead Time})$$

### Reorder Point (ROP)

The physical inventory level that triggers an automated replenishment indent:
$$\text{Reorder Point (ROP)} = (\text{Avg Daily Usage} \times \text{Avg Lead Time}) + \text{Safety Stock}$$

### Maximum Stock Ceiling

$$\text{Max Stock} = \text{ROP} + (\text{Avg Daily Usage} \times 15\text{ days})$$

---

## 2. Inventory Health Status Classifications

| Status                | Condition                                                         | Automated System Action                                                                 |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **HEALTHY**           | $\text{Current Stock} > \text{ROP}$ and $\le \text{Max Stock}$    | Normal operations; no action required.                                                  |
| **REORDER_TRIGGERED** | $\text{Current Stock} \le \text{ROP}$ and $> \text{Safety Stock}$ | Automated replenishment suggestion queued for Purchase Manager.                         |
| **CRITICAL_SHORTAGE** | $\text{Current Stock} \le \text{Safety Stock}$                    | High-priority alert sent to Project Director and Purchase Manager to expedite delivery. |
| **EXCESS_STOCK**      | $\text{Current Stock} > \text{Max Stock}$                         | Alerts store keeper to halt purchasing and prioritize inter-site transfer.              |
