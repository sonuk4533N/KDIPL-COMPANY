# Phase 11J — Production Launch & Rollback Checklist

## Overview

This runbook provides the definitive cutover schedule, operational checklists, deployment procedures, and emergency rollback protocols for launching the KDIPL ERP platform to production.

---

## 1. Launch Cutover Timeline

| Countdown             | Responsibility        | Activities & Verification                                                                                                                               | Sign-off Required |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **T-7 Days**          | SysAdmin / Lead Dev   | Complete staging dry run of database migration, execute full backup drill (`npm run backup:run`), run load benchmark (`npm run perf:load-test`).        | Lead Dev          |
| **T-48 Hours**        | Project Director / MD | Announce scheduled 3-hour maintenance window to all site offices and vendors. Cutoff time for legacy data entry set to Friday 18:00 IST.                | Managing Director |
| **T-24 Hours**        | Lead Dev / DevOps     | Freeze code repository; verify production secrets in production secret manager; verify production TLS certificates and DNS TTL reduced to 300s.         | SysAdmin          |
| **T-2 Hours**         | DevOps                | Preflight environment verification: `npm run preflight:prod`. Verify PostgreSQL server health, connection pool capacity, and S3 bucket IAM permissions. | DevOps            |
| **T-0 (Launch Hour)** | Cutover Team          | Execute maintenance mode, apply final database migrations, deploy application bundle, run smoke tests.                                                  | Cutover Team      |
| **T+30 Mins**         | Lead QA               | Execute production smoke test suite (`npm run smoke:test`); verify health endpoint (`/api/health`).                                                     | QA Lead           |
| **T+1 Hour**          | Project Director      | Lift maintenance mode; broadcast system availability; open login for early key users.                                                                   | Project Director  |

---

## 2. Step-by-Step Deployment Runbook

### Step 1: Enable Maintenance Banner / Mode

Redirect public traffic to the branded maintenance page:

```bash
# Set maintenance environment variable
export NEXT_PUBLIC_MAINTENANCE_MODE=true
```

### Step 2: Capture Pre-Cutover Cold Database Snapshot

```bash
npm run backup:run
# Verify backup file checksum and size in /backups
```

### Step 3: Apply Production Database Migrations

```bash
npx prisma migrate deploy
# Verify zero pending migrations
npx prisma migrate status
```

### Step 4: Seed Initial Mandatory System Reference Data (If not present)

```bash
npm run seed:admin
# Verifies superadmin account, chart of accounts root, default tax rates
```

### Step 5: Deploy Production Next.js Application Bundle

```bash
# Build standalone production image or bundle
npm run build

# Start production server with cluster process manager (PM2 / Docker)
npm run start:prod
```

### Step 6: Execute Automated Post-Deployment Smoke Tests

```bash
npm run smoke:test
```

Verify:

1. `GET /api/health` returns `200 OK` with database latency `< 25ms`.
2. Static assets load cleanly without MIME-type or CORS errors.
3. TLS certificate grades `A+` on SSL Labs.
4. Active database connections match configured pool parameters.

### Step 7: Disable Maintenance Mode & Open Access

```bash
export NEXT_PUBLIC_MAINTENANCE_MODE=false
```

---

## 3. Emergency Rollback Protocol

### Rollback Triggers

The Cutover Team must immediately abort and initiate rollback if ANY of the following conditions occur within 45 minutes of deployment:

1. **Critical Health Failure**: `/api/health` returns non-200 status code for > 3 consecutive checks.
2. **Database Migration Failure**: Unrecoverable SQL syntax, constraint, or deadlocking error during `prisma migrate deploy`.
3. **Data Loss / Corruption**: Inconsistent financial ledger or inventory balance calculations during post-deployment sanity checks.
4. **Smoke Test Failure**: Any blocker or high-severity failure in `npm run smoke:test`.
5. **System Latency Spike**: Average request response latency > 3,000ms under nominal load.

### Rollback Execution Steps

```
[Trigger Abort]
      │
      ▼
1. Re-enable Maintenance Window (HTTP 503)
      │
      ▼
2. Stop Running Application Processes (`pm2 stop kdipl-erp` / `docker stop`)
      │
      ▼
3. Restore Pre-Cutover Database Snapshot
   `npm run restore:test -- --snapshot <pre_cutover_snapshot_file>`
      │
      ▼
4. Rollback Application Binary / Image to Previous Stable Release SHA
      │
      ▼
5. Restart Previous Application Version
      │
      ▼
6. Re-run Smoke Test Suite against Restored Instance (`npm run smoke:test`)
      │
      ▼
7. Lift Maintenance Banner & Notify Stakeholders
```

### Incident Post-Mortem Requirement

Following any rollback, the cutover team must:

1. Lock production database logs and build artifacts.
2. Convene an emergency post-mortem within 4 hours.
3. Publish a Root Cause Analysis (RCA) report before scheduling a new cutover window.
