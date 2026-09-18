# Production release and recovery runbook

Phase 10 release work is tracked in [phase-10-progress.md](phase-10-progress.md). This runbook is a set of executable gates; passing the configuration command alone does not authorize a production release.

## Ownership and environments

- Maintain separate development, staging and production application, PostgreSQL and object-storage resources. No production credentials in source control, CI test fixtures or staging.
- Host production data in an India cloud region. Record the actual database, object-store, backup and log regions before approval.
- Plan for up to 200 users and a launch across all projects. Department leads complete user acceptance; the Managing Director gives final launch approval.
- Name the operational owner, on-call contact, escalation path, domain and approved change window. Respond to a critical outage within one hour.

## Release gate

1. In staging, build the exact commit intended for production. Record its SHA and the successful CI URL. Verify a fresh migration deployment and seed without demo credentials.
2. Set `NODE_ENV=production` and the candidate production environment, then run `npm run release:check`. This checks HTTPS origin, durable S3 storage, essential storage settings and absence of test/demo bootstrap values without printing secrets.
3. Verify credentials through the secret manager. Confirm TLS for PostgreSQL, HTTPS/TLS for object storage, private buckets, restricted service accounts, encrypted volumes, and approved India regions. The script cannot attest to the host's physical region, backup schedule, credential strength, or external service ownership.
4. Obtain KDIPL/CA approval for GST/TDS settings and any monetary stock-valuation policy. Verify the approved malware-scanning service and quarantine behavior with a harmless test signature. Local signatures alone do not establish comprehensive antivirus coverage.
5. Validate access with real role accounts: three-way match, independent MD approval, document visibility, site assignment isolation, reversals, Tally export, offline reconnect and denial of unauthorized actions. Use staging data; do not create test financial transactions in production.
6. Finish the [recovery drill](#backup-and-restore-drill) and [security and operations checks](#security-and-operations-checks), then collect department-lead UAT evidence and MD sign-off.
7. Record the approved release commit, migration list, operator, start/end time and the previous release SHA in the deployment change record.

## Deployment

1. Before the maintenance window, confirm the latest backup and point-in-time recovery marker can be located and that active users have been notified.
2. Deploy the exact approved commit to staging, run `npm ci`, `npm run db:generate`, `npm run db:migrate:deploy`, `npm run build`, and the standard CI checks. Use the same deployment artifact in production.
3. Apply pending production migrations once through the controlled deployment job. Run `npx prisma migrate status` to confirm no pending migrations. Migration output and operator identity belong in the change record.
4. Roll out the application while watching `/api/health`, failed requests, database health, background jobs and storage errors. Use HTTPS for application and storage endpoints.
5. Perform read-only smoke checks: health responds successfully, assigned users can sign in and view only permitted data, and previously approved records still load. Verify the outbox/Tally exporter status without generating test payments.
6. Confirm successful service monitoring and hand over to the named support owner.

## Backup and restore drill

- Configure daily database backups plus point-in-time recovery. Perform a restore into an isolated environment at least quarterly. Record the backup ID, restore time, data integrity checks and failure remediation.
- Preserve encrypted object-storage files and audit/export records for the approved retention period (at least eight financial years for commercial and inventory documents). Enable object versioning or an equivalent recovery strategy; database-only restores leave document references incomplete.
- After an isolated restore, verify schema version, latest expected transaction numbers, inventory ledger-derived balances, approved invoice/payable totals, document access, audit events and Tally export idempotency. Never run destructive restore tests against production.
- Document the actual recovery time and data-loss window achieved. KDIPL must sign off on recovery objectives before launch.

## Incident and rollback

- Declare an incident if health degrades, posting becomes unsafe, permissions leak, external scanning fails open, or backup integrity is uncertain. Page the owner and start the one-hour response clock.
- Pause writes/financial posting before a database recovery. Preserve logs, audit history and transaction references; do not edit immutable ledgers or financial records to make a release appear healthy.
- For application-only regressions, redeploy the previous known-good artifact when it remains compatible with the deployed schema.
- Database migrations require a reviewed forward fix or a coordinated point-in-time restore with object storage and external export reconciliation. Do not blindly reverse applied migrations. Check for already exported Tally events or delivered notifications before replay.
- After recovery, repeat read-only smoke checks, compare ledger and payable totals, and record the incident and approval to resume writes.

## Security and operations checks

- Verify Admin, Accounts, Directors and MD use the approved two-factor setup and that first-login reset, password policy, session caps and session revocation behave as specified.
- Verify approved malware scanning and quarantined uploads, blocked executables, 24-hour document links, retention, audit restrictions, authorization on search/report/export, and PWA cache exclusions.
- Monitor uptime, application errors, slow requests, database health, failed background jobs and storage usage. Alert on failed backup, malware scanner failure, payment/export queue failures and temporary negative-stock deadlines. Do not put passwords, document bytes, GPS coordinates or financial details in routine logs.
- Approve and configure WhatsApp delivery only through an identified provider; confirm retries and failure monitoring. Keep Tally XML/file transport under an identified Accounts owner.
- Record a mid-range Android device and 4G performance/accessibility measurement plus offline draft recovery behavior. Automated desktop and emulator tests do not replace this field check.
