# Phase 11E — Audit & Compliance Readiness

## 1. Statutory & Regulatory Retention Rules

Under Indian corporate and taxation law (Companies Act, 2013 and GST Rules), commercial, procurement, inventory, and accounts transactions must be retained for at least **8 Financial Years**.

- **No Hard Deletion Policy:** Finalized business records (`MaterialRequirement`, `PurchaseOrder`, `GoodsReceipt`, `StockTransaction`, `Invoice`, `Payment`) and audit entries are **never hard-deleted**. Reversals, cancellations, and status amendments are appended as historical records with actor attribution.
- **Audit Trail Coverage:** Every state transition records:
  - `actorUserId`: Immutable UUID of the authenticated actor.
  - `action`: Action enum (`CREATE`, `APPROVE`, `REJECT`, `VERIFY`, `LOGIN`, `EXPORT`, etc.).
  - `before` & `after`: JSON snapshots of modified fields.
  - `reason`: Mandatory text justification for overrides, amendments, or send-backs.
  - `createdAt`: Microsecond-precision server timestamp.

---

## 2. Indian Financial Year Numbering Standard

All official business transactions adhere to the Indian Financial Year format (`1 April – 31 March`):

- Material Requirements: `MR/2026-27/0001`
- RFQs: `RFQ/2026-27/0001`
- Purchase Orders: `PO/2026-27/0001`
- Goods Receipts: `GRN/2026-27/0001`
- Stock Vouchers: `STK/2026-27/0001`
- Payment Vouchers: `PV/2026-27/0001`

Sequence numbers are guarded against race conditions using transactional sequencing (`src/server/transactions/transaction-number-service.ts`).

---

## 3. Exportable Compliance Reports

The platform provides instant exports in XLSX, PDF, and CSV for statutory auditors:

1. **GST Inward Supply Register (GSTR-2B Reconciliation):** Vendor GSTIN, invoice number, taxable value, CGST, SGST, IGST, and payment voucher references.
2. **Stock Valuation & Inventory Movement Register:** Opening stock, receipts, issues, adjustments, and closing stock calculated under the CA-approved moving weighted average method.
3. **Audit Trail Export:** Complete chronological log of user activity, role changes, approval decisions, and login events.
