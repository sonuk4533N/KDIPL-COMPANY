# Phase 11B — Security Hardening & RBAC Review

## 1. Role-Based Access Control (RBAC) & Perimeter Summary

The platform enforces strict role boundaries across 10 defined system and business roles:

| Role Code                       | Role Name            | 2FA Mandatory | Data Scope          | Key Permitted Actions                                                                                         |
| :------------------------------ | :------------------- | :------------ | :------------------ | :------------------------------------------------------------------------------------------------------------ |
| `SYSTEM_ADMINISTRATOR`          | System Administrator | **Yes**       | Global (Support)    | User management, role permissions, system configuration, audit viewing. Cannot approve business transactions. |
| `MANAGING_DIRECTOR`             | Managing Director    | **Yes**       | Global (Company)    | Final approval on budgets, invoices, payments, vendor blacklisting, and company-wide reports.                 |
| `PROJECT_DIRECTOR`              | Project Director     | **Yes**       | Global (Projects)   | Project approvals, budget proposals, material requirement approvals across all projects.                      |
| `BUSINESS_DEVELOPMENT_DIRECTOR` | BD Director          | **Yes**       | Global (Commercial) | Commercial RFQ review, quotation recommendation, client contracts.                                            |
| `PROJECT_MANAGER`               | Project Manager      | No            | Assigned Projects   | MR approval for assigned projects, site oversight, GRN approval.                                              |
| `PURCHASE_MANAGER`              | Purchase Manager     | No            | Global (Purchasing) | RFQ issue, supplier quotation entry, PO issuance up to threshold limit.                                       |
| `ACCOUNTS`                      | Accounts Officer     | **Yes**       | Global (Financial)  | 3-Way match, invoice entry, payment processing, TallyPrime export.                                            |
| `ACCOUNTS_ADMIN`                | Accounts Lead        | **Yes**       | Global (Financial)  | Payment approval, tax parameter configuration, Tally reconciliation.                                          |
| `STORE_KEEPER`                  | Store Keeper         | No            | Assigned Stores     | GRN physical verification, stock entry, material issue, transfer dispatch.                                    |
| `SITE_SUPERVISOR`               | Site Supervisor      | No            | Assigned Sites      | Site MR submission, delivery acknowledgment, damage/scrap reporting.                                          |

---

## 2. Privileged-Role Two-Factor Authentication (2FA/TOTP)

- **Standard:** RFC 6238 Time-based One-Time Password with 30-second time-step and SHA-1 HMAC.
- **Enforced Roles:** `SYSTEM_ADMINISTRATOR`, `ACCOUNTS`, `ACCOUNTS_ADMIN`, `MANAGING_DIRECTOR`, `PROJECT_DIRECTOR`, `BUSINESS_DEVELOPMENT_DIRECTOR`.
- **Login Challenge:** Authenticated password prompts for 6-digit TOTP code via signed challenge token (`src/features/auth/two-factor-service.ts`).
- **Emergency Recovery:** 8 single-use, cryptographically generated backup recovery codes hashed with SHA-256 (`src/server/auth/totp.ts`).
- **Audit Trail:** Enrollment, TOTP verification, and backup code utilization are recorded in `AuditLog`.

---

## 3. Web & Network Application Hardening

- **Content Security Policy (CSP):**
  - `default-src 'self'`
  - `script-src 'self' 'nonce-...'`
  - `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' data: https://kdipl-production-documents.s3.ap-south-1.amazonaws.com`
  - `object-src 'none'`
  - `frame-ancestors 'none'`
- **Anti-Framing & Clickjacking:** `X-Frame-Options: DENY`.
- **MIME Sniffing Prevention:** `X-Content-Type-Options: nosniff`.
- **Referrer Policy:** `strict-origin-when-cross-origin`.
- **CSRF Defense:** Origin and Referer validation enforced on all state-modifying mutations (`validateMutationOrigin` in `src/server/auth/request-security.ts`).
- **Brute-Force Rate Limiting:**
  - Maximum 5 attempts per 15-minute window for authentication endpoints.
  - In-memory sliding bucket rate-limiter with IP and normalized account hash keys (`src/server/auth/rate-limit.ts`).

---

## 4. SQL Injection & Data Access Safety

- **Prisma Parameterization:** 100% of queries use Prisma Client ORM or tagged template literals (`db.$queryRaw` or `db.$executeRaw`). Zero dynamic string interpolation.
- **Assignment Scoping:** Queries for project members and site supervisors inject assignment filters (`projectId IN (...)`, `siteId IN (...)`) automatically to prevent horizontal privilege escalation.

---

## 5. File Upload Security & Fail-Closed Antivirus

- **Upload Size Ceiling:** 50 MB hard cap enforced at proxy and application tier.
- **Malware Scanning:** Synchronous and asynchronous ClamAV / HTTP malware scanning.
- **Fail-Closed Quarantine:** If the scanning service is down or times out, the file is automatically marked `QUARANTINED` / `SCAN_FAILED` (never `CLEAN`).
- **Executable Blocklist:** `.exe`, `.bat`, `.sh`, `.vbs`, `.msi`, `.cmd`, `.scr` extensions and magic byte signatures are strictly rejected.
