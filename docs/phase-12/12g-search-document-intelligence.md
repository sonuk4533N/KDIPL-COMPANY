# Phase 12G — Document & Search Intelligence

## Overview

Phase 12G equips KDIPL with intelligent document metadata extraction (OCR-ready architecture), document tagging, and multi-field global search indexing.

Implemented in:

- Engine: [`src/server/intelligence/document-search-intelligence.ts`](file:///c:/Users/Sonu%20Kumar/OneDrive/Desktop/KDIPL%20COMPANY/src/server/intelligence/document-search-intelligence.ts)

---

## 1. Document Tagging & Versioning

Every uploaded document is categorized with standardized tags:

- `TAX_INVOICE`
- `DELIVERY_CHALLAN`
- `PURCHASE_ORDER`
- `QUALITY_CERTIFICATE`
- `MEASUREMENT_SHEET`
- `E_WAY_BILL`
- `BANK_ADVICE`
- `SITE_PHOTO`

All documents retain immutable audit history with version increments on re-upload.

---

## 2. OCR-Ready Extraction Engine

Automatically analyzes document text and parses key compliance and financial fields:

- **Vendor GSTIN**: Validates against the 15-character statutory GSTIN pattern.
- **Invoice Number**: Isolates alphanumeric supplier invoice references.
- **PO Reference**: Links incoming bills to authorized purchase order codes.
- **Total Amount**: Extracts invoice grand total with decimal precision.
- **Extraction Confidence Score**: Returns a 0–100% confidence rating to indicate when human verification is advised.

---

## 3. Multi-Field Global Search Indexing

Indexes projects, materials, vendors, purchase orders, goods receipts, and invoices:

- Weighted relevance ranking (Code matches = 100pts; Title matches = 50pts; Keyword matches = 25pts).
- Full end-to-end transaction lineage (Requisition $\rightarrow$ RFQ $\rightarrow$ PO $\rightarrow$ GRN $\rightarrow$ Invoice $\rightarrow$ Payment $\rightarrow$ Tally Export).
