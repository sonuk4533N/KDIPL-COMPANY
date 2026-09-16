# Phase 7 - Supplier invoices, accounts payable, payments, GST and Tally export

Status: complete on `phase-7-accounts-payable`; ready for draft PR review. Do not merge automatically.

Base: `main` at `26d19b5`. Phase 5 and Phase 6 inventory controls remain unchanged.

## Delivered scope

- Server-calculated supplier invoices with Indian GST, TDS, RCM, discounts, freight, due dates, financial-year numbering and duplicate prevention.
- Transactional three-way matching across accepted purchase orders, posted GRNs and prior invoice allocations, including explicit mismatch review and acceptance reasons.
- Independent Accounts verification and Managing Director approval with immutable finalized records and audited state transitions.
- Partial and final payments, cheque clearance, payment reversals, supplier advances, advance application/refund/reversal, and credit/debit notes.
- Project and work-package actual-cost allocation while preserving purchase-order commitments separately.
- Durable, idempotent TallyPrime XML export events with payload checksums, failure recording and retry.
- Secure retained documents, permission-scoped global search, notification outbox events and financial reports/exports.
- Responsive desktop/mobile workflows plus local offline invoice-draft capture; approvals and postings remain server-only.

## Approval and permission matrix

| Action                                  | Accounts | Accounts Admin | Managing Director      | System Administrator |
| --------------------------------------- | -------- | -------------- | ---------------------- | -------------------- |
| Create/edit invoice draft and run match | Yes      | Yes            | No                     | No                   |
| Accept documented mismatch and verify   | Yes      | Yes            | No                     | No                   |
| Approve/reject invoice                  | No       | No             | Yes, independent actor | No                   |
| Prepare payment or supplier advance     | Yes      | Yes            | No                     | No                   |
| Approve/reject payment or advance       | No       | No             | Yes, independent actor | No                   |
| Maintain effective-dated tax settings   | No       | Yes            | No                     | No                   |
| Retry failed Tally export               | Yes      | Yes            | No                     | No                   |
| Technical support visibility            | No       | No             | No                     | Yes, read-only       |

## Three-way matching rules

- Match supplier, material, unit, quantities, accepted GRN eligibility, prior invoice allocation, price, GST, freight, discounts, taxable value and total.
- Every variance stores expected and actual values and blocks verification until Accounts supplies a reason and resolves or explicitly accepts it.
- PostgreSQL transactions and advisory locks prevent concurrent invoices from consuming the same GRN quantity.
- Database guards prevent finalized invoice allocations and financial child records from being edited or deleted.

## GST and payable rules

- The server recalculates taxable values and totals with decimal arithmetic and selects CGST/SGST or IGST from place-of-supply rules.
- Mixed GST rates, RCM, TDS, pre/post-tax discounts, taxable/non-taxable freight, cess, ITC eligibility and round-off are retained with the invoice snapshot.
- Successful approved payments and applied advances reduce payable balance; failed, voided or reversed transactions do not.
- Credit/debit notes retain original invoice values, tax impact, applied amount and remaining unapplied amount.

## Quality-gate evidence

All required gates passed on 16 September 2026:

- `npm run db:generate` - Prisma Client generated successfully.
- Fresh database migration deployment - all 25 migrations applied successfully.
- `npm run db:seed` - Phase 7 PO, posted GRN, tax, bank, document and role fixtures seeded.
- `npm run format:check`, `npm run lint`, `npm run typecheck` - passed with zero warnings/errors.
- `npm run test:unit` - 14 files, 88 tests passed.
- `npm run test:integration` - 10 files, 41 PostgreSQL tests passed; none skipped.
- `npm run build` - Next.js 16 production build passed; 32 routes generated.
- `npm run test:e2e` - 30 Playwright tests passed across desktop and mobile.

## Operational dependencies

- PostgreSQL remains required for transactional posting, constraints and advisory locks.
- Production object storage, malware/signature scanning and signed-download credentials must be configured outside source control.
- WhatsApp delivery needs an approved provider adapter; notification outbox events are implemented without hard-coded credentials.
- TallyPrime begins with compatible XML/file export; live transport can be added behind the replaceable adapter.
- Accounts Admin must maintain CA-approved effective-dated GST/TDS rules before production use.

Phase 8 has not been started.
