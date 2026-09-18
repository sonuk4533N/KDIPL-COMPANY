import "dotenv/config";

import { env } from "../src/config/env.ts";
import { productionReadinessIssues } from "../src/config/production-readiness.ts";

const issues = productionReadinessIssues(env, {
  demoBusinessPassword: process.env.DEMO_BUSINESS_PASSWORD,
});

if (issues.length > 0) {
  for (const issue of issues) {
    process.stderr.write(`Production configuration: ${issue}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Production configuration checks passed. Complete the Phase 10 service, security, backup and UAT gates before release.\n",
  );
}
