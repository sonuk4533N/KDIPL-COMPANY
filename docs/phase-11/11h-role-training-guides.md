# Phase 11H — User Training & Operational Role Guides

This training manual details role-specific operational guidelines, login instructions, daily routines, approval responsibilities, and error-handling steps for all 9 platform roles.

---

## 1. Managing Director (MD)

- **Access & Security:** Employee Code + Password + **Mandatory 2FA (TOTP)**.
- **Daily Workflow:** Review company executive dashboard (committed purchases, approved invoices, vendor payables, stock value across all projects).
- **Approval Responsibilities:**
  - Project work-package budget proposals & revisions.
  - Commercial RFQ vendor selection above threshold.
  - High-value purchase orders.
  - Final approval on invoices and payment disbursement batches.
  - Project stock closures.
- **Error / Reversal:** May reject any pending approval with mandatory reason or send back for departmental review.

---

## 2. Project Director

- **Access & Security:** Employee Code + Password + **Mandatory 2FA (TOTP)**.
- **Daily Workflow:** Monitor project milestones, budget consumption vs physical progress, site material delivery backlogs.
- **Approval Responsibilities:** Material requirements across all active projects; physical count reconciliations; project closure requests.
- **Error / Reversal:** Can dispute GRN exception reports or request supplier chargebacks.

---

## 3. Project Manager (PM)

- **Access & Security:** Employee Code + Password (Assigned project scope).
- **Daily Workflow:** Review Site MRs, verify alignment with BOQ, track delivery commitments.
- **Approval Responsibilities:** Approves or sends back Material Requirements from Site Supervisors under assigned projects.
- **Mobile Workflow:** Web and mobile dashboard access; reviews on-site deliveries.

---

## 4. Purchase Manager

- **Access & Security:** Employee Code + Password.
- **Daily Workflow:** Check approved Material Requirements queue; bundle into RFQs; track quotation submissions.
- **Operational Duties:**
  - Enter comparative supplier quotations.
  - Issue approved Purchase Orders.
  - Track overdue supplier delivery dates.
- **Error / Reversal:** PO amendments (quantity/rate adjustments) require recorded reason and director re-approval.

---

## 5. Store Keeper

- **Access & Security:** Employee Code + Password (Assigned stores scope).
- **Daily Workflow:** Inward material arrivals against open POs; issue items to site teams; record physical stock balances.
- **Operational Duties:**
  - Verify delivery challan and count physical units.
  - Capture mandatory photo evidence of materials.
  - Log damaged/rejected items into quarantine transit.
  - Issue materials against approved site requisitions.
- **Mobile Workflow:** Uses tablet/mobile to capture delivery photos and scan challans directly at store unloading dock.

---

## 6. Site Supervisor

- **Access & Security:** Employee Code + Password (Assigned sites scope).
- **Daily Workflow:** Request materials needed for upcoming work packages; acknowledge receipts arriving directly at site.
- **Operational Duties:**
  - Submit Material Requirements (Site MR) with project location.
  - Acknowledge direct-site deliveries with GPS geotagging.
  - Report site material scrap or damaged stock.
- **Mobile Workflow:** Fully supported offline draft mode; captures camera evidence and syncs automatically upon 4G/Wi-Fi connection.

---

## 7. Accounts & Accounts Admin

- **Access & Security:** Employee Code + Password + **Mandatory 2FA (TOTP)**.
- **Daily Workflow:** Process incoming supplier invoices; verify 3-way match; prepare payment vouchers.
- **Operational Duties:**
  - Automatic matching of PO + GRN + Invoice.
  - TDS and GST ledger verification.
  - Export approved invoices and payments to TallyPrime XML.
- **Error / Reversal:** Mismatched invoices are flagged into `DISPUTED` status and sent back to Purchase/Supplier for credit note.

---

## 8. Business Development (BD) Director

- **Access & Security:** Employee Code + Password + **Mandatory 2FA (TOTP)**.
- **Daily Workflow:** Review commercial procurement bids, supplier negotiation summaries, and tender budgets.
- **Approval Responsibilities:** Recommends commercial terms on large RFQs before MD sign-off.

---

## 9. System Administrator

- **Access & Security:** Employee Code + Password + **Mandatory 2FA (TOTP)**.
- **Daily Workflow:** Monitor application health (`/api/health`), audit logs, user provisioning requests, and backup verification.
- **Operational Duties:**
  - Create/deactivate user accounts.
  - Assist users with 2FA re-enrollment or emergency backup code resets.
  - Review system configuration and audit logs.
- **Strict Boundary:** Administrators have technical support visibility but **cannot perform commercial or financial business approvals**.
