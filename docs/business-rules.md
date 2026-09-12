# KDIPL Confirmed Business Rules

These rules were confirmed by the customer questionnaire completed in September 2026. They supersede earlier provisional defaults where they conflict. Higher-risk exceptions are explicitly marked and must remain auditable.

## Organization and access

- KDIPL starts with one branch; the data model must allow more branches later.
- Only directors may hold simultaneous assignments across multiple projects or sites.
- Accounts and Project Directors have organization-wide project visibility.
- The Managing Director can view all data, approve transactions, and administer policy, but cannot silently edit finalized business transactions.
- The Business Development Director can view projects, clients, budgets, and management reports.
- Development, staging, and production environments are required.

## Purchase orders and supplier selection

- Purchase Manager issues an approved PO.
- Quotation approval is sufficient; there is no duplicate approval immediately before issue.
- Receiving is allowed once the PO is `ISSUED`; supplier acknowledgment is tracked but does not block receiving.
- Issued PO changes require a versioned amendment and renewed approval.
- Purchase Manager may cancel an issued PO. Partially received POs are short-closed rather than silently cancelled.
- There is no fixed minimum quotation count.
- Purchase Manager may choose any supplier. The selected quotation, comparison, decision maker, and rationale must remain auditable.
- Expired quotations require refreshed validity or a Project Director-approved exception.
- One-time/unregistered suppliers require Purchase Manager creation and Project Director approval.
- Revised quotations retain every version; comparison uses the latest active version.
- Multiple supplier branches may share one GSTIN.
- Purchase Manager requests supplier blacklist/reactivation; Managing Director approves it.

## Inventory locations and ownership

- Required location types are Central Store, Project Store, Site Store, Temporary Store, Transit Location, and Damaged/Rejected Area.
- Stock is owned by an inventory location and tagged to its project/site where applicable.
- Inter-project transfers move quantity and cost together.
- Every inter-store transfer requires Project Director approval.
- For the confirmed transfer accounting policy, source and destination balances update at destination receipt; the open transfer remains separately visible until receipt.
- Transfer shortage/damage records actual receipt and creates an audited variance requiring Managing Director adjustment approval.
- Project closure automatically transfers remaining stock to Central Store.
- Reorder levels are maintained per project.

## GRN and receiving

- Purchase Manager alone creates a draft GRN.
- Store Keeper verifies the physical receipt.
- Project Manager approves the verified GRN.
- Stock posts only after Project Manager approval.
- Multiple partial GRNs are permitted; Project Manager may short-close the balance.
- Excess receipt has no fixed percentage ceiling, but requires Project Manager approval and a mandatory reason. **Higher-risk customer exception.**
- Direct supplier delivery to a site requires a site GRN and Site Supervisor acknowledgment.
- Mandatory direct-site evidence: GPS, delivery challan, material photos, supplier invoice, vehicle details, and receiver signature.
- Accepted, damaged, and rejected quantities are recorded separately.
- Damaged/rejected material remains non-usable and follows Return to Vendor for replacement or credit note.
- Damage/rejection requires a reason and photos.
- Finalized receipts are corrected with reversal plus a new transaction; they are never edited in place.

## Negative stock and issues

- Store Keepers may create temporary negative usable stock. **Higher-risk customer exception.**
- Negative stock must be visibly flagged and corrected within three working days.
- A Site Supervisor request alone authorizes a material issue.
- Quantity above the request requires Project Manager approval.
- Site Supervisor acknowledgment is mandatory for site delivery or transfer.
- Unused site material return: Site Supervisor requests; Store Keeper verifies receipt.
- Actual material consumption is not tracked separately.
- Normal wastage, damage, theft/loss, breakage, scrap, and obsolete material are tracked separately.
- Every stock adjustment and transfer variance adjustment requires Managing Director approval.
- Mandatory physical count occurs at project closure; Store Keeper counts and Accounts verifies.
- Store Keeper enters opening stock manually; Project Manager approves it.
- Store Keeper may enter transaction-level unit conversion; Project Manager approves any new or changed conversion.

## Procurement exceptions

- Only Purchase Manager may initiate cash/direct purchases.
- Managing Director approves every cash purchase.
- Emergency purchases may bypass normal quotation rules with a mandatory reason and retrospective approval within 24 hours.

## Accounts and tax

- Accounts verifies supplier invoices using strict PO–GRN–invoice three-way matching.
- Every mismatch requires manual review; there is no automatic tolerance.
- Multiple invoices may reference one PO and one invoice may span multiple POs.
- Accounts verifies invoices; Managing Director approves invoices and every payment.
- Partial payments are allowed and retain the remaining balance.
- Supplier advances require PO terms plus Managing Director approval.
- Credit/debit notes link to the original invoice and GRN.
- Due date is invoice date plus supplier/PO credit terms.
- Supported payment methods: NEFT/RTGS/IMPS, UPI, cheque, cash, company card, and employee reimbursement.
- Item-level GST automatically derives CGST/SGST/IGST.
- TDS, reverse charge, input-tax-credit eligibility, freight taxation, and discounts before/after tax are supported.
- Accounts Admin maintains CA-approved tax rules.
- Duplicate invoice is blocked on supplier GSTIN, invoice number, and financial year.
- Approved transactions export to TallyPrime.
- Transaction numbers use the Indian financial year.

## Documents, security, and retention

- Commercial and inventory documents are retained for at least eight financial years.
- Finalized business records and audit logs are never hard-deleted; archive or reversal preserves history.
- Upload limit is 50 MB. Malware scanning and quarantine are mandatory, and executable files are blocked.
- Assigned workflow users, Accounts, Directors, and Managing Director may access transaction documents according to data scope.
- Signed download links expire after 24 hours.
- Employee code and password are used for login.
- Passwords require at least 12 characters and first-login reset.
- Admin, Accounts, Directors, and Managing Director require two-factor authentication.
- A user may have up to three active sessions; sessions last until the browser closes.
- Customer selected no account lockout after repeated failures. **Higher-risk customer exception:** request/IP rate limiting and security-event auditing remain mandatory.

## Mobile, alerts, and reporting

- Offline drafts synchronize after reconnection.
- Mobile capabilities: camera/photo upload, GPS, document scan, and voice-to-text remarks.
- GPS is mandatory for direct-site GRN, site material request, site receipt, site return, and damage/loss report.
- QR/barcodes are not required.
- Approval reminder occurs after 24 hours and escalates after 48 hours.
- Time-limited delegation to an equal/higher role retains a full audit trail.
- Notification channels are in-app and WhatsApp.
- WhatsApp events: approvals, MR decisions, PO issue/amend/cancel, overdue delivery, GRN decisions, and damaged/excess delivery.
- First release reports include stock, ledger, delivery backlog, purchases, damaged/rejected stock, payables/payments, GST register, approvals, low stock, and project material cost.
- Global search covers projects/sites, materials/suppliers, MRs, RFQs/quotations, POs, GRNs, stock entries, invoices/payments, and employees.
- Exports support XLSX, PDF, CSV, and print views.

## Budget and BOQ

- Track budget, committed PO value, actual invoices, and remaining balance.
- Budgets are configured at work-package level.
- Project Director proposes budgets/revisions; Managing Director approves.
- Budget overrun warns but does not block purchase. **Higher-risk customer exception.**
- Material Requirements link to BOQ items when available; exceptions require a reason.
- BOQs are versioned and variations are separately approved.

## Go-live and operations

- Import employees/users, projects/sites, materials/units, suppliers, opening stock, open POs, outstanding invoices, and all available historical purchases.
- Imported data is validated with error preview and activated only after Managing Director approval.
- Launch all projects simultaneously after department-lead UAT and final Managing Director approval. **Higher-risk rollout choice.**
- Design target is up to 200 users.
- Host in an India cloud region.
- Use daily backups, point-in-time recovery, and quarterly restore tests.
- Monitor uptime, application errors, slow requests, database health, failed jobs, and storage usage.
- Production-critical outage response target is one hour.
