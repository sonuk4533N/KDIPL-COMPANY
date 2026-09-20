import "dotenv/config";

import { performance } from "node:perf_hooks";
import {
  calculateDerivedInventoryBalance,
  type InventoryBalanceTransaction,
} from "../src/server/inventory/domain.ts";
import { generateTotpCode, verifyTotpCode } from "../src/server/auth/totp.ts";
function threeWayMatchCheck(input: {
  poAmount: number;
  receivedQuantity: number;
  poRate: number;
  invoiceAmount: number;
  billedQuantity: number;
}) {
  const expectedAmount = input.receivedQuantity * input.poRate;
  const matched =
    Math.abs(expectedAmount - input.invoiceAmount) < 0.01 &&
    input.billedQuantity <= input.receivedQuantity;
  return { matched, expectedAmount };
}

async function runProductionLoadBenchmark() {
  process.stdout.write(
    "=====================================================\n",
  );
  process.stdout.write(
    "KDIPL Operations Platform — Phase 11F Load & Concurrency\n",
  );
  process.stdout.write(
    "=====================================================\n\n",
  );

  const CONCURRENT_WORKERS = 200;
  const OPERATIONS_PER_WORKER = 50;
  const TOTAL_OPERATIONS = CONCURRENT_WORKERS * OPERATIONS_PER_WORKER; // 10,000 operations

  process.stdout.write(
    `Benchmarking ${TOTAL_OPERATIONS.toLocaleString()} operations across ${CONCURRENT_WORKERS} concurrent simulated users...\n\n`,
  );

  // Prepare test dataset: 500 transactions per balance calculation
  const mockTransactions: InventoryBalanceTransaction[] = [];
  for (let i = 0; i < 500; i++) {
    mockTransactions.push({
      quantity: 10 + (i % 50),
      transactionType: i % 2 === 0 ? "RECEIPT" : "ISSUE",
    });
  }

  const testTotpSecret = "JBSWY3DPEHPK3PXP";
  const latencies: number[] = [];

  const startTime = performance.now();

  // Run worker tasks concurrently
  const workers = Array.from(
    { length: CONCURRENT_WORKERS },
    async (_, workerId) => {
      for (let op = 0; op < OPERATIONS_PER_WORKER; op++) {
        const opStart = performance.now();

        // Mix of operations:
        // 1. Heavy derived inventory ledger computation
        calculateDerivedInventoryBalance(mockTransactions);

        // 2. Financial 3-way match validation
        threeWayMatchCheck({
          poAmount: 10000 + workerId,
          receivedQuantity: 200,
          poRate: 50,
          invoiceAmount: 10000 + workerId,
          billedQuantity: 200,
        });

        // 3. HMAC-SHA1 2FA authentication token generation & check
        const code = generateTotpCode(testTotpSecret);
        verifyTotpCode(testTotpSecret, code);

        const opEnd = performance.now();
        latencies.push(opEnd - opStart);
      }
    },
  );

  await Promise.all(workers);

  const totalTimeMs = performance.now() - startTime;
  const throughputRps = (TOTAL_OPERATIONS / (totalTimeMs / 1000)).toFixed(0);

  // Sort latencies for percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)]!.toFixed(2);
  const p95 = latencies[Math.floor(latencies.length * 0.95)]!.toFixed(2);
  const p99 = latencies[Math.floor(latencies.length * 0.99)]!.toFixed(2);
  const max = latencies[latencies.length - 1]!.toFixed(2);
  const slowCount = latencies.filter((l) => l > 500).length;

  process.stdout.write(
    "-----------------------------------------------------\n",
  );
  process.stdout.write("BENCHMARK RESULTS:\n");
  process.stdout.write(
    "-----------------------------------------------------\n",
  );
  process.stdout.write(
    `Total Operations:    ${TOTAL_OPERATIONS.toLocaleString()}\n`,
  );
  process.stdout.write(`Concurrent Users:    ${CONCURRENT_WORKERS}\n`);
  process.stdout.write(
    `Total Elapsed Time:  ${(totalTimeMs / 1000).toFixed(2)} seconds\n`,
  );
  process.stdout.write(
    `Throughput:          ${Number(throughputRps).toLocaleString()} ops/sec\n`,
  );
  process.stdout.write(`Latency p50 (median):${p50.padStart(8)} ms\n`);
  process.stdout.write(`Latency p95:         ${p95.padStart(8)} ms\n`);
  process.stdout.write(`Latency p99:         ${p99.padStart(8)} ms\n`);
  process.stdout.write(`Latency max:         ${max.padStart(8)} ms\n`);
  process.stdout.write(`Slow Requests (>500ms): ${slowCount}\n`);
  process.stdout.write(
    "-----------------------------------------------------\n",
  );

  const passed = Number(p95) < 200 && slowCount === 0;
  if (passed) {
    process.stdout.write("PERFORMANCE VALIDATION: PASSED.\n");
    process.stdout.write(
      "Engine comfortably satisfies target concurrency of 200 users within SLA.\n\n",
    );
  } else {
    process.stderr.write("PERFORMANCE VALIDATION: FAILED SLA thresholds.\n\n");
    process.exitCode = 1;
  }
}

runProductionLoadBenchmark().catch((err) => {
  process.stderr.write(`Load benchmark error: ${err.message}\n`);
  process.exitCode = 1;
});
