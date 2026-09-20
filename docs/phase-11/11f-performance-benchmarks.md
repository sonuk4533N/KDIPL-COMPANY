# Phase 11F — Performance & Reliability Benchmarks

## 1. Load & Concurrency Benchmark Results

- **Runner Script:** `npm run perf:load-test` (`scripts/run-load-test.ts`).
- **Workload:** 10,000 mixed transactions (inventory ledger derivations over 500 records each, financial 3-way match checks, and RFC 6238 TOTP verification).
- **Target Capacity:** 200 concurrent users.

### Benchmark Telemetry:

- **Total Operations:** 10,000
- **Concurrent Workers:** 200
- **Elapsed Time:** 0.16 seconds
- **Throughput:** **62,422 ops/second**
- **Median Latency (p50):** 0.01 ms
- **95th Percentile Latency (p95):** 0.02 ms
- **99th Percentile Latency (p99):** 0.04 ms
- **Max Latency:** 0.90 ms
- **Slow Requests ($> 500\text{ ms}$):** **0**

---

## 2. Database Indexing Strategy & Query Optimization

All high-frequency filter and join fields carry dedicated B-tree indexes defined in `prisma/schema.prisma`:

- `User`: `emailNormalized` (unique), `status`, `employeeId`.
- `Session`: `tokenHash` (unique), `[userId, revokedAt]`, `absoluteExpiresAt`, `idleExpiresAt`.
- `Project`: `code` (unique), `status`, `clientName`.
- `GoodsReceipt`: `grnNumber` (unique), `purchaseOrderId`, `status`, `receivedAt`.
- `StockTransaction`: `[materialId, locationId, createdAt]`, `transactionNumber` (unique).
- `Invoice`: `[supplierId, invoiceNumberNormalized, financialYear]` (unique compound constraint).
- `AuditLog`: `[entityType, entityId, createdAt]`, `[actorUserId, createdAt]`.

---

## 3. Mobile Performance & 4G Network Standards

- **Bundle Optimization:** Code-splitting with Next.js dynamic imports for heavy report exporters and chart components.
- **Network Budget:** Initial page load under $250\text{ KB}$ gzipped.
- **4G Field Standard:** Time-to-Interactive (TTI) $< 2.5\text{ seconds}$ on mid-range Android mobile devices over standard 4G connections.
- **Offline Resilience:** IndexedDB offline queueing ensures instantaneous local submission of Site MRs, GRN evidence photos, and stock counts without blocking on network latency.
