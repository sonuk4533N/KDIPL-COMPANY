# Phase 11D — Production Monitoring & Observability

## 1. System Health Endpoint

- **Endpoint:** `GET /api/health`
- **Visibility:** Public uptime ping with internal diagnostic payload.
- **Checks Performed:**
  - PostgreSQL connectivity & query latency (ms).
  - Storage provider reachability.
  - Antivirus scanner service status.
  - Git release commit SHA identification.
  - Process uptime.

---

## 2. Telemetry & Metric Thresholds

| Metric                         | Target / Threshold               | Alert Level        | Action Trigger                                                      |
| :----------------------------- | :------------------------------- | :----------------- | :------------------------------------------------------------------ |
| **HTTP 5xx Error Rate**        | $> 1\%$ for 5 minutes            | **Critical (P1)**  | Page on-call engineer; inspect error logs.                          |
| **API Response Latency (p95)** | $> 500\text{ ms}$ for 10 minutes | **Warning (P2)**   | Inspect database slow queries and connection pool.                  |
| **Database CPU Utilization**   | $> 80\%$ for 15 minutes          | **Warning (P2)**   | Review query execution plans; autoscale read replicas.              |
| **Database Connection Pool**   | $> 85\%$ active connections      | **Warning (P2)**   | Check for unclosed transactions or leaked connections.              |
| **Failed Login Rate**          | $> 20$ failures / 5 minutes      | **Security Alert** | Investigate potential credential stuffing or brute-force attack.    |
| **Storage Quota Utilization**  | $> 85\%$ capacity                | **Warning (P3)**   | Expand disk volume or adjust lifecycle retention.                   |
| **Malware Scanner Outage**     | Scanner unreachable              | **Security Alert** | All uploads fail-closed to `QUARANTINED`. Reconnect scanner daemon. |
| **Offline Sync Failure Queue** | $> 10$ sync failures             | **Warning (P3)**   | Notify site supervisor; review conflict resolution logs.            |

---

## 3. Incident Escalation & Response SLA

- **P1 (Critical Outage / Data Loss Risk):** Response SLA $\le 1\text{ hour}$. Escalation: On-Call Engineer $\to$ DevOps Lead $\to$ Managing Director.
- **P2 (Degraded Performance / Non-blocking Workflow Failure):** Response SLA $\le 4\text{ hours}$.
- **P3 (Minor Bug / Cosmetic Issue):** Response SLA $\le 24\text{ hours}$.
