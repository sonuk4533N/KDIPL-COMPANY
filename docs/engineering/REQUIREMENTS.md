# Confirmed Functional & Non-Functional Requirements

## 1. Functional Requirements by Module

### 1.1 Authentication & RBAC
* Multi-role support with primary business roles: `MANAGING_DIRECTOR`, `PROJECT_DIRECTOR`, `PROJECT_MANAGER`, `PURCHASE_MANAGER`, `ACCOUNTS`, `ACCOUNTS_ADMIN`, `SITE_SUPERVISOR`, `STORE_KEEPER`, `SYSTEM_ADMINISTRATOR`.
* Data scoping: Directors have organization-wide visibility; Project Managers and Site Supervisors are strictly scoped to assigned projects and sites.
* Mandatory Two-Factor Authentication (TOTP 2FA) supported with recovery codes.
* System Administrators retain technical administrative access but are blocked from approving operational business transactions.

### 1.2 Material Requirements (MR)
* Site Supervisors or Project Managers initiate MRs for assigned sites.
* Each material line must specify an active catalog SKU, positive numeric quantity, and needed-by calendar date.
* Creator self-approval is blocked; Supervisor submissions require Project Manager approval; Project Manager submissions require Project Director approval.

### 1.3 Procurement & Purchase Orders (PO)
* Purchase Manager issues RFQs and selects suppliers; supplier selection decisions must retain audit trails and comparisons.
* PO transitions from `DRAFT` to `ISSUED` upon approved sourcing decision without redundant approval before issue.
* PO amendments require versioned history; cancellations must be reasoned and partially received POs must be short-closed.

### 1.4 Inventory & Receiving (GRN)
* Store Keeper physically verifies receipts; Project Manager approves GRNs; stock ledger updates only upon Project Manager approval.
* Accepted, damaged, and rejected quantities are recorded independently.
* Double-entry append-only stock ledger; physical stock movements follow Indian Financial Year sequence numbering (`FY-YY-YY-XXXX`).
* Inter-store transfers require Project Director approval and destination receipt confirmation before balance movement.

### 1.5 Finance & Accounts Payable
* Three-way matching (PO - GRN - Invoice) enforced without silent tolerance.
* Managing Director approves all invoice payments, supplier advances, and cash purchases.
* Duplicate invoice protection based on Supplier GSTIN, Invoice Number, and Financial Year.
* Structured data export to TallyPrime.

### 1.6 Enterprise & BI
* Multi-entity group consolidations (4 legal entities: KDIPL, KD Infra Engineering, KD Highway Concessions, KD Heavy Plant & Logistics).
* Automated elimination of inter-company revenue and receivables.

## 2. Non-Functional Requirements
* **Integrity**: Zero silent data corruption; all mutations wrap in atomic ACID transactions.
* **Security**: OWASP compliance; CSP headers; HSTS in production; Argon2id password hashing; HTTP-only SameSite cookies; zero cleartext credential storage.
* **Audit**: Complete, immutable audit log of all business state transitions.
* **Performance**: Sub-100ms API response time on indexed queries; 50MB file upload ceiling with quarantine validation.
