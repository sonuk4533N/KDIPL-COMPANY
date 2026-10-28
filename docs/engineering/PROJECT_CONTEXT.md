# Project Context: KDIPL Operations Platform

## 1. System Overview & Technology Stack
* **Project Name**: `kdipl-operations-platform` (KDIPL: Kumar Designs India Private Limited)
* **Application Framework**: Next.js 16.3.5 (App Router, Turbopack, React 19.2.8)
* **Language & Runtime**: TypeScript 5, Node.js >= 22.0.0, npm >= 11.0.0
* **Database & ORM**: PostgreSQL (running on port 5432) with Prisma ORM 7.9.1 and `@prisma/adapter-pg`
* **Styling**: Tailwind CSS v4, Lucide React icons, Radix UI primitives
* **Security & Auth**: Argon2id password hashing, SHA-256 opaque session tokens stored in PostgreSQL with idle/absolute expiry, TOTP 2FA (Phase 10)
* **Testing Stack**: Vitest 4.1.11 (unit & integration), Playwright 1.62.1 (E2E), ESLint 9

## 2. Directory Structure & Key Modules
* `src/app/(app)`: Authenticated App Router routes (`/dashboard`, `/projects`, `/requirements`, `/procurement`, `/inventory`, `/accounts`, `/enterprise`, `/reports`, `/administration`)
* `src/app/(auth)`: Authentication routes (`/login`, `/change-password`, `/account/security`)
* `src/features`: Domain business services:
  * `administration`: User and employee provisioning, role assignment
  * `auth`: Credential management, session handling, 2FA
  * `catalog`: Material master and SKU catalog
  * `finance`: Invoices, credit notes, 3-way matching, payments, GST, TallyPrime export
  * `inventory`: Goods Receipt Notes (GRN), store locations, stock movements, customer-aligned issue/transfer/adjustment/count policies
  * `offline`: PWA offline reference data and offline sync engine
  * `procurement`: Sourcing, RFQs, vendor quotations, PO issuance and amendments
  * `projects`: Project portfolios, site assignments
  * `reporting`: Analytical reports and CSV/PDF export
  * `requirements`: Material requisitions (MR), line items, approval workflows
* `src/server`: Shared server infrastructure:
  * `audit`: Immutable audit logging
  * `auth`: Password hashing (Argon2id), rate limiting, session verification
  * `authorization`: RBAC with live project/site employee assignment scopes
  * `database`: Transaction helpers and Prisma client
  * `enterprise`: Multi-company consolidations and inter-company transactions
  * `intelligence`: Executive dashboard metrics and BI analytics
* `prisma/schema.prisma`: Data model with 29 applied migrations
* `docs/`: Historical phase design documentation (Phases 0–13, ADRs, approval matrix, business rules, RBAC)

## 3. Engineering Conventions
* **Read / Write Separation**: React Server Components perform side-effect-free server reads; thin Server Actions handle browser commands calling domain services.
* **Database Transactions**: All dependent writes, state transitions, and audit logs are committed atomically in a single Prisma transaction.
* **Separation of Duties (SoD)**: Self-approval is strictly forbidden (e.g. submitter/creator cannot approve their own MR; PM cannot create RFQ without PM assignment; System Administrators cannot approve operational business transactions).
* **Auditability**: Finalized business records and audit entries are immutable and never hard-deleted.
