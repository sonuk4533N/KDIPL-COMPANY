# Phase 11G — Standard Operating Procedures (SOPs)

This document details the 10 core operational SOPs governing daily administration and business workflows on the KDIPL Operations Platform.

---

### SOP 01: User Onboarding & First-Login Setup

1. **Creation:** System Administrator logs into `/administration` and navigates to **User Management** $\to$ **New User**.
2. **Details:** Enter employee code, full name, official work email, department, designation, and assigned roles.
3. **Password Generation:** Provide initial temporary password (minimum 12 characters). Flag `mustChangePassword` is automatically set to `true`.
4. **First Login:** User accesses `https://erp.kdipl.in/login`, enters temporary credentials, and is forced to set a private password.
5. **2FA Enrollment:** If assigned to a privileged role (Admin, Accounts, Director, MD), the user is prompted to scan the QR code into their authenticator app and save their 8 emergency recovery codes.

---

### SOP 02: User Deactivation & Access Revocation

1. **Immediate Deactivation:** In `/administration`, select the employee and click **Deactivate**.
2. **Automatic Session Kill:** Changing status to `DISABLED` instantly increments `authVersion`, invalidating all active sessions across desktop and mobile devices.
3. **Audit Record:** Provide a deactivation reason (e.g. "Employee resignation" or "Transfer"). Historical audit records remain intact.

---

### SOP 03: Role & Permission Reassignment

1. Only the `SYSTEM_ADMINISTRATOR` may reassign roles.
2. At least one active System Administrator must always remain.
3. Role changes revoke existing sessions upon next request to ensure immediate permission recalculation.

---

### SOP 04: Project Lifecycle (Creation to Closure)

1. **Creation:** Project Director creates project with client details, start date, budget, and assigned Project Manager.
2. **Sites:** Add project sites with geo-coordinates and assign Site Supervisors.
3. **Budget Approval:** MD approves the work-package level budget.
4. **Closure:** When physical construction finishes, run **Project Stock Closure**:
   - Verify all pending POs are closed.
   - Transfer unused inventory to central store or scrap.
   - Verify zero open stock discrepancies.
   - Project Director submits closure; Managing Director gives final closure sign-off.

---

### SOP 05: Purchase Workflow (MR to PO)

1. **Requirement:** Site Supervisor submits Material Requirement (linking to BOQ where applicable).
2. **Approval:** Project Manager reviews and approves within assigned project scope.
3. **RFQ & Quotations:** Purchase Manager creates RFQ, invites supplier quotes, and enters quotation comparison.
4. **Recommendation & Approval:** BD Director recommends; Managing Director approves commercial terms.
5. **PO Generation:** PO auto-generates with unique FY sequence and is issued to supplier with delivery deadline.

---

### SOP 06: Physical Receiving & Goods Receipt Note (GRN)

1. **Delivery Arrival:** Vehicle arrives at store or site with Delivery Challan.
2. **Physical Verification:** Store Keeper inspects materials against PO and enters accepted/damaged/rejected counts.
3. **Mandatory Evidence:** Upload photo of material and delivery challan. (GPS capture required for direct-site GRN).
4. **Damage / Quarantine:** Any damaged goods are placed in quarantine transit storage; replacement allowance is automatically opened.
5. **Posting:** Posting the GRN updates the immutable stock ledger and triggers pending 3-way match in Accounts.

---

### SOP 07: Inventory Issue & Inter-Store Transfer

1. **Issue:** Site submits material requisition. Store Keeper issues against project code. Stock ledger immediately derives reduced quantity.
2. **Transfer:** Source store issues `TRANSFER_OUT` voucher. Receiving store inspects and accepts via `TRANSFER_IN` voucher.

---

### SOP 08: Periodic Physical Stock Count

1. **Count Order:** Quarterly physical stock count initiated by Store Keeper or Auditor.
2. **Blind Count:** Staff record actual counts without viewing book balances.
3. **Discrepancy Report:** System highlights variance. Store Keeper enters explanation.
4. **Reconciliation:** Project Director reviews and approves adjustment vouchers (`ADJUSTMENT_IN` / `ADJUSTMENT_OUT`).

---

### SOP 09: Accounts Payable & TallyPrime Export

1. **Invoice Intake:** Supplier invoice received in Accounts.
2. **3-Way Match:** System cross-references PO rate/quantity vs GRN accepted quantity vs Invoice amount.
3. **Verification & Approval:** Accounts verifies match; Managing Director approves invoices above standard threshold.
4. **Payment Processing:** Record payment voucher with bank reference and TDS deduction.
5. **TallyPrime Export:** Accounts exports verified batch to Tally XML. Export status changes to `COMPLETED`. Duplicate exports are strictly prevented.

---

### SOP 10: Incident Response & System Rollback

1. **Detection:** Monitor alert triggered (5xx errors, slow queries, scanner failure).
2. **Triage:** On-call engineer initiates response within 1 hour.
3. **Severity Assessment:** If database corruption or data leak risk, pause traffic via maintenance mode.
4. **Rollback:** For application regressions, redeploy previous validated `RELEASE_SHA`. For database issues, execute PITR restore drill (SOP Phase 11C).
5. **Post-Mortem:** Document root cause, timeline, and corrective actions within 24 hours.
