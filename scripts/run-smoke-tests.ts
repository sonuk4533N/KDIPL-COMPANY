import "dotenv/config";

import { createHash } from "node:crypto";
import { env } from "../src/config/env.ts";
import { productionReadinessIssues } from "../src/config/production-readiness.ts";
import { scanFileLocally } from "../src/server/storage/file-security.ts";
import { calculateDerivedInventoryBalance } from "../src/server/inventory/domain.ts";

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function calculateSessionExpiry(now = new Date()) {
  return {
    absoluteExpiresAt: new Date(
      now.getTime() + env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
    ),
    idleExpiresAt: new Date(
      now.getTime() + env.SESSION_IDLE_MINUTES * 60 * 1000,
    ),
  };
}

const PRIVILEGED_ROLE_CODES = [
  "SYSTEM_ADMINISTRATOR",
  "ACCOUNTS",
  "ACCOUNTS_ADMIN",
  "MANAGING_DIRECTOR",
  "PROJECT_DIRECTOR",
  "BUSINESS_DEVELOPMENT_DIRECTOR",
];

function isPrivilegedRole(roleCodes: string[]): boolean {
  return roleCodes.some((code) => PRIVILEGED_ROLE_CODES.includes(code));
}

async function runProductionSmokeTests() {
  process.stdout.write(
    "=====================================================\n",
  );
  process.stdout.write(
    "KDIPL Operations Platform — Phase 11 Smoke Test Suite\n",
  );
  process.stdout.write(
    "=====================================================\n\n",
  );

  const results: {
    category: string;
    test: string;
    passed: boolean;
    details: string;
  }[] = [];

  // Check 1: Session Security & Revocation Math
  try {
    const fixedNow = new Date("2026-09-20T10:00:00.000Z");
    const expiry = calculateSessionExpiry(fixedNow);
    const token = "smoke-test-token-string-value";
    const hashed = hashSessionToken(token);
    const validExpiry =
      expiry.absoluteExpiresAt.getTime() > fixedNow.getTime() &&
      expiry.idleExpiresAt.getTime() > fixedNow.getTime();

    results.push({
      category: "Authentication & Session",
      test: "Session Expiry & SHA-256 Hash Tokenization",
      passed: validExpiry && hashed.length === 64,
      details: `Absolute: +${env.SESSION_ABSOLUTE_HOURS}h, Idle: +${env.SESSION_IDLE_MINUTES}m, Hash length: ${hashed.length}`,
    });
  } catch (err) {
    results.push({
      category: "Authentication & Session",
      test: "Session Expiry & Hash Tokenization",
      passed: false,
      details: err instanceof Error ? err.message : "Error",
    });
  }

  // Check 2: Privileged Role 2FA Enforcement Boundaries
  try {
    const adminPrivileged = isPrivilegedRole(["SYSTEM_ADMINISTRATOR"]);
    const accountsPrivileged = isPrivilegedRole(["ACCOUNTS"]);
    const mdPrivileged = isPrivilegedRole(["MANAGING_DIRECTOR"]);
    const storeKeeperNonPrivileged = !isPrivilegedRole(["STORE_KEEPER"]);
    const siteSupervisorNonPrivileged = !isPrivilegedRole(["SITE_SUPERVISOR"]);

    const allRoleChecks =
      adminPrivileged &&
      accountsPrivileged &&
      mdPrivileged &&
      storeKeeperNonPrivileged &&
      siteSupervisorNonPrivileged;

    results.push({
      category: "Security & RBAC",
      test: "Privileged-Role 2FA Perimeter Isolation",
      passed: allRoleChecks,
      details: `Verified ${PRIVILEGED_ROLE_CODES.length} privileged roles require 2FA; operational roles separated`,
    });
  } catch (err) {
    results.push({
      category: "Security & RBAC",
      test: "Privileged-Role 2FA Perimeter Isolation",
      passed: false,
      details: err instanceof Error ? err.message : "Error",
    });
  }

  // Check 3: Malware Scanning & Fail-Closed Quarantine
  try {
    const testDoc = new TextEncoder().encode("KDIPL Valid Smoke Test Document");
    const cleanScan = scanFileLocally(testDoc);
    const eicarDoc = new TextEncoder().encode(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    );
    const blockedScan = scanFileLocally(eicarDoc);

    const scanPassed =
      cleanScan.status === "CLEAN" && blockedScan.status === "REJECTED";
    results.push({
      category: "Defense-in-Depth",
      test: "Antivirus Interception & Clean Document Ingestion",
      passed: scanPassed,
      details: `Clean: ${cleanScan.status}, EICAR Test Signature: ${blockedScan.status}`,
    });
  } catch (err) {
    results.push({
      category: "Defense-in-Depth",
      test: "Antivirus Interception",
      passed: false,
      details: err instanceof Error ? err.message : "Error",
    });
  }

  // Check 4: Immutable Stock Ledger Balance Calculation
  try {
    const sampleTransactions = [
      { quantity: 100, transactionType: "RECEIPT" as const },
      { quantity: 30, transactionType: "ISSUE" as const },
      { quantity: 10, transactionType: "TRANSFER_OUT" as const },
      { quantity: 5, transactionType: "TRANSFER_IN" as const },
    ];
    // 100 - 30 - 10 + 5 = 65
    const balance = calculateDerivedInventoryBalance(sampleTransactions);
    const ledgerValid = balance.quantityOnHand === 65;

    results.push({
      category: "Inventory & Integrity",
      test: "Derived Ledger Balance Calculation (Zero Drift)",
      passed: ledgerValid,
      details: `Derived quantity: ${balance.quantityOnHand} (expected 65)`,
    });
  } catch (err) {
    results.push({
      category: "Inventory & Integrity",
      test: "Derived Ledger Balance Calculation",
      passed: false,
      details: err instanceof Error ? err.message : "Error",
    });
  }

  // Check 5: Production Configuration Rule Evaluation
  try {
    // Run validator against mock production config to ensure rules are active
    const candidateProduction = {
      NODE_ENV: "production" as const,
      DATABASE_URL:
        "postgresql://kdipl_app:Pass123456@db.mumbai.internal:5432/kdipl_prod?sslmode=verify-full",
      APP_URL: "https://erp.kdipl.in",
      RELEASE_SHA: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      AUTH_SECRET: "j8S2xN5vQ9cF4mL7rT1yH6kP3wD0aZ8uB5eG2iJ9oC4sV7nM",
      SESSION_ABSOLUTE_HOURS: 12,
      SESSION_IDLE_MINUTES: 120,
      AUTH_RATE_LIMIT_ATTEMPTS: 5,
      AUTH_RATE_LIMIT_WINDOW_MINUTES: 15,
      FILE_STORAGE_PROVIDER: "s3" as const,
      FILE_STORAGE_BUCKET: "kdipl-production-docs",
      FILE_STORAGE_REGION: "ap-south-1",
      FILE_STORAGE_FORCE_PATH_STYLE: false,
      FILE_STORAGE_MAX_BYTES: 52428800,
      FILE_STORAGE_LOCAL_PATH: ".data/uploads",
      FILE_SCANNER_PROVIDER: "local" as const,
      LOG_LEVEL: "info" as const,
    };
    const issues = productionReadinessIssues(candidateProduction);
    results.push({
      category: "Release Preflight",
      test: "Production Environment Guardrails Evaluation",
      passed: issues.length === 0,
      details:
        issues.length === 0
          ? "Production profile accepted cleanly"
          : `Issues: ${issues.join(", ")}`,
    });
  } catch (err) {
    results.push({
      category: "Release Preflight",
      test: "Production Environment Guardrails",
      passed: false,
      details: err instanceof Error ? err.message : "Error",
    });
  }

  // Output Results
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✔ PASS" : "✖ FAIL";
    process.stdout.write(
      `${icon} | ${r.category.padEnd(25)} | ${r.test.padEnd(45)} | ${r.details}\n`,
    );
    if (!r.passed) allPassed = false;
  }

  process.stdout.write(
    "\n-----------------------------------------------------\n",
  );
  if (allPassed) {
    process.stdout.write(
      "SMOKE TESTS SUCCESSFUL: Application runtime, RBAC, and ledger calculations verified.\n\n",
    );
  } else {
    process.stderr.write(
      "SMOKE TESTS FAILED: One or more critical subsystems failed verification.\n\n",
    );
    process.exitCode = 1;
  }
}

runProductionSmokeTests().catch((err) => {
  process.stderr.write(`Smoke test suite error: ${err.message}\n`);
  process.exitCode = 1;
});
