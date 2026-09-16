-- Phase 7 is additive. Existing PO, GRN and inventory records are referenced,
-- never rewritten, and all financial posting uses separate append-only events.
ALTER TABLE "Project"
  ADD COLUMN "procurementBudget" DECIMAL(18,2);

ALTER TABLE "Supplier"
  ADD COLUMN "accountsApprovedUnregistered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultCreditDays" INTEGER NOT NULL DEFAULT 30,
  ADD CONSTRAINT "Supplier_defaultCreditDays_check" CHECK ("defaultCreditDays" BETWEEN 0 AND 3650),
  ADD CONSTRAINT "Supplier_gst_registration_check" CHECK (
    ("isGstRegistered" = true AND "gstin" IS NOT NULL)
    OR ("isGstRegistered" = false)
  );

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "creditDays" INTEGER,
  ADD COLUMN "permitsAdvance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maximumAdvancePercent" DECIMAL(5,2),
  ADD CONSTRAINT "PurchaseOrder_creditDays_check" CHECK ("creditDays" IS NULL OR "creditDays" BETWEEN 0 AND 3650),
  ADD CONSTRAINT "PurchaseOrder_advance_terms_check" CHECK (
    ("permitsAdvance" = false AND "maximumAdvancePercent" IS NULL)
    OR ("permitsAdvance" = true AND "maximumAdvancePercent" BETWEEN 0.01 AND 100)
  );

ALTER TABLE "GoodsReceiptException"
  ADD COLUMN "financialResolutionType" VARCHAR(30),
  ADD COLUMN "financialResolutionId" UUID,
  ADD COLUMN "financiallyResolvedAt" TIMESTAMP(3),
  ADD CONSTRAINT "GoodsReceiptException_financial_resolution_check" CHECK (
    ("financiallyResolvedAt" IS NULL)
    OR ("financialResolutionType" IN ('REPLACEMENT', 'CREDIT_NOTE', 'DEBIT_NOTE') AND "financialResolutionId" IS NOT NULL)
  );

INSERT INTO "Role" ("id", "code", "name", "description", "isSystem", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'ACCOUNTS_ADMIN', 'Accounts Admin', 'Maintains CA-approved effective-dated tax settings.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid(), code, 'Phase 7 financial permission.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM unnest(ARRAY[
  'invoice.create','invoice.match','invoice.approve',
  'payment.view','payment.create','payment.approve','tax.manage','tally.export'
]) AS code
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "grantedAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
JOIN "Permission" permission ON (
  (role."code" = 'MANAGING_DIRECTOR' AND permission."code" IN ('invoice.view','invoice.approve','payment.view','payment.approve','report.view','report.export','notification.view'))
  OR (role."code" = 'ACCOUNTS' AND permission."code" IN ('project.view','purchase.view','invoice.view','invoice.create','invoice.match','invoice.verify','payment.view','payment.create','tally.export','report.view','report.export','notification.view'))
  OR (role."code" = 'ACCOUNTS_ADMIN' AND permission."code" IN ('app.access','inventory.view','project.view','purchase.view','invoice.view','invoice.create','invoice.match','invoice.verify','payment.view','payment.create','tax.manage','tally.export','report.view','report.export','notification.view'))
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

CREATE TABLE "FinanceSequence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "documentType" VARCHAR(20) NOT NULL,
  "financialYear" CHAR(5) NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "FinanceSequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceSequence_next_check" CHECK ("nextValue" > 0),
  CONSTRAINT "FinanceSequence_fy_check" CHECK ("financialYear" ~ '^[0-9]{2}-[0-9]{2}$')
);
CREATE UNIQUE INDEX "FinanceSequence_documentType_financialYear_key" ON "FinanceSequence"("documentType", "financialYear");

CREATE TABLE "TaxRuleVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(80) NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "rate" DECIMAL(7,4) NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "settings" JSONB,
  "approvedById" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxRuleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxRuleVersion_kind_check" CHECK ("kind" IN ('GST', 'TDS', 'CESS', 'OTHER')),
  CONSTRAINT "TaxRuleVersion_rate_check" CHECK ("rate" BETWEEN 0 AND 100),
  CONSTRAINT "TaxRuleVersion_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "TaxRuleVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "TaxRuleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "TaxRuleVersion_code_effectiveFrom_key" ON "TaxRuleVersion"("code", "effectiveFrom");
CREATE INDEX "TaxRuleVersion_kind_effectiveFrom_effectiveTo_idx" ON "TaxRuleVersion"("kind", "effectiveFrom", "effectiveTo");

CREATE TABLE "CompanyBankAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountName" VARCHAR(160) NOT NULL,
  "bankName" VARCHAR(160) NOT NULL,
  "maskedAccount" VARCHAR(40) NOT NULL,
  "ifsc" VARCHAR(20) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompanyBankAccount_bankName_maskedAccount_key" ON "CompanyBankAccount"("bankName", "maskedAccount");

CREATE TABLE "SupplierInvoice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "internalNumber" VARCHAR(30) NOT NULL,
  "supplierId" UUID NOT NULL,
  "supplierIdentityKey" VARCHAR(180) NOT NULL,
  "supplierInvoiceNumber" VARCHAR(100) NOT NULL,
  "normalizedInvoiceNumber" VARCHAR(100) NOT NULL,
  "invoiceDate" DATE NOT NULL,
  "financialYear" CHAR(5) NOT NULL,
  "placeOfSupply" VARCHAR(120) NOT NULL,
  "calculatedDueDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "creditTermsSource" VARCHAR(30) NOT NULL,
  "dueDateOverrideReason" VARCHAR(1000),
  "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  "taxableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "tdsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "roundOff" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "invoiceTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "approvedPayable" DECIMAL(18,2),
  "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "creditApplied" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "debitApplied" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "advanceApplied" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "taxRuleSnapshot" JSONB,
  "remarks" TEXT,
  "documentId" UUID,
  "createdById" UUID NOT NULL,
  "reviewedById" UUID,
  "verifiedById" UUID,
  "approvedById" UUID,
  "rejectedById" UUID,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierInvoice_status_check" CHECK ("status" IN ('DRAFT','UNDER_REVIEW','MATCHED','VERIFIED','MD_APPROVAL_PENDING','APPROVED','PARTIALLY_PAID','PAID','CANCELLED','DISPUTED','REJECTED','PAYMENT_HOLD')),
  CONSTRAINT "SupplierInvoice_amounts_check" CHECK ("taxableValue" >= 0 AND "invoiceTotal" >= 0 AND "paidAmount" >= 0 AND "creditApplied" >= 0 AND "debitApplied" >= 0 AND "advanceApplied" >= 0),
  CONSTRAINT "SupplierInvoice_roundoff_check" CHECK ("roundOff" BETWEEN -1 AND 1),
  CONSTRAINT "SupplierInvoice_due_override_check" CHECK ("dueDate" = "calculatedDueDate" OR length(trim(coalesce("dueDateOverrideReason", ''))) >= 3),
  CONSTRAINT "SupplierInvoice_document_check" CHECK ("status" = 'DRAFT' OR "documentId" IS NOT NULL),
  CONSTRAINT "SupplierInvoice_approval_check" CHECK ("status" NOT IN ('APPROVED','PARTIALLY_PAID','PAID','PAYMENT_HOLD') OR ("approvedById" IS NOT NULL AND "approvedPayable" IS NOT NULL AND "finalizedAt" IS NOT NULL)),
  CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoice_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoice_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoice_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierInvoice_internalNumber_key" ON "SupplierInvoice"("internalNumber");
CREATE UNIQUE INDEX "SupplierInvoice_supplierIdentityKey_normalizedInvoiceNumber_financialYear_key" ON "SupplierInvoice"("supplierIdentityKey", "normalizedInvoiceNumber", "financialYear");
CREATE INDEX "SupplierInvoice_supplierId_status_dueDate_idx" ON "SupplierInvoice"("supplierId", "status", "dueDate");
CREATE INDEX "SupplierInvoice_status_createdAt_idx" ON "SupplierInvoice"("status", "createdAt");

CREATE TABLE "SupplierInvoicePurchaseOrder" (
  "invoiceId" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierInvoicePurchaseOrder_pkey" PRIMARY KEY ("invoiceId", "purchaseOrderId"),
  CONSTRAINT "SupplierInvoicePurchaseOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoicePurchaseOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT
);
CREATE INDEX "SupplierInvoicePurchaseOrder_purchaseOrderId_idx" ON "SupplierInvoicePurchaseOrder"("purchaseOrderId");

CREATE TABLE "SupplierInvoiceGoodsReceipt" (
  "invoiceId" UUID NOT NULL,
  "goodsReceiptId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierInvoiceGoodsReceipt_pkey" PRIMARY KEY ("invoiceId", "goodsReceiptId"),
  CONSTRAINT "SupplierInvoiceGoodsReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceGoodsReceipt_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT
);
CREATE INDEX "SupplierInvoiceGoodsReceipt_goodsReceiptId_idx" ON "SupplierInvoiceGoodsReceipt"("goodsReceiptId");

CREATE TABLE "SupplierInvoiceLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL,
  "purchaseOrderLineId" UUID NOT NULL,
  "materialId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "hsnSac" VARCHAR(20) NOT NULL,
  "taxRuleVersionId" UUID NOT NULL,
  "tdsRuleVersionId" UUID,
  "cessRuleVersionId" UUID,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "discountBeforeTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discountAfterTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "freightAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "freightTaxable" BOOLEAN NOT NULL DEFAULT false,
  "taxableValue" DECIMAL(18,2) NOT NULL,
  "gstRate" DECIMAL(7,4) NOT NULL,
  "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "cessRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "tdsRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "tdsAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
  "inputTaxCreditEligible" BOOLEAN NOT NULL DEFAULT true,
  "linePayable" DECIMAL(18,2) NOT NULL,
  "matchStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "mismatchAcceptedById" UUID,
  "mismatchAcceptanceReason" VARCHAR(1000),
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierInvoiceLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierInvoiceLine_amounts_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "taxableValue" >= 0 AND "linePayable" >= 0),
  CONSTRAINT "SupplierInvoiceLine_rates_check" CHECK ("gstRate" BETWEEN 0 AND 100 AND "cessRate" BETWEEN 0 AND 100 AND "tdsRate" BETWEEN 0 AND 100),
  CONSTRAINT "SupplierInvoiceLine_match_check" CHECK ("matchStatus" IN ('PENDING','MATCHED','MISMATCH','ACCEPTED')),
  CONSTRAINT "SupplierInvoiceLine_acceptance_check" CHECK ("matchStatus" <> 'ACCEPTED' OR ("mismatchAcceptedById" IS NOT NULL AND length(trim(coalesce("mismatchAcceptanceReason", ''))) >= 3)),
  CONSTRAINT "SupplierInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceLine_taxRuleVersionId_fkey" FOREIGN KEY ("taxRuleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceLine_tdsRuleVersionId_fkey" FOREIGN KEY ("tdsRuleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceLine_cessRuleVersionId_fkey" FOREIGN KEY ("cessRuleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceLine_mismatchAcceptedById_fkey" FOREIGN KEY ("mismatchAcceptedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "SupplierInvoiceLine_invoiceId_position_idx" ON "SupplierInvoiceLine"("invoiceId", "position");
CREATE INDEX "SupplierInvoiceLine_purchaseOrderLineId_idx" ON "SupplierInvoiceLine"("purchaseOrderLineId");

CREATE TABLE "SupplierInvoiceAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceLineId" UUID NOT NULL,
  "goodsReceiptLineId" UUID NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierInvoiceAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierInvoiceAllocation_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "SupplierInvoiceAllocation_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "SupplierInvoiceLine"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierInvoiceAllocation_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierInvoiceAllocation_invoiceLineId_goodsReceiptLineId_key" ON "SupplierInvoiceAllocation"("invoiceLineId", "goodsReceiptLineId");
CREATE INDEX "SupplierInvoiceAllocation_goodsReceiptLineId_idx" ON "SupplierInvoiceAllocation"("goodsReceiptLineId");

CREATE TABLE "InvoiceMismatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL,
  "invoiceLineId" UUID,
  "field" VARCHAR(80) NOT NULL,
  "expectedValue" VARCHAR(500) NOT NULL,
  "actualValue" VARCHAR(500) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "reviewReason" VARCHAR(1000),
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceMismatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceMismatch_status_check" CHECK ("status" IN ('OPEN','ACCEPTED','RESOLVED')),
  CONSTRAINT "InvoiceMismatch_review_check" CHECK ("status" = 'OPEN' OR ("reviewedById" IS NOT NULL AND length(trim(coalesce("reviewReason", ''))) >= 3 AND "reviewedAt" IS NOT NULL)),
  CONSTRAINT "InvoiceMismatch_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "InvoiceMismatch_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "SupplierInvoiceLine"("id") ON DELETE RESTRICT,
  CONSTRAINT "InvoiceMismatch_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "InvoiceMismatch_invoiceId_status_idx" ON "InvoiceMismatch"("invoiceId", "status");

CREATE TABLE "FinanceWorkflowEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entityType" VARCHAR(30) NOT NULL,
  "entityId" UUID NOT NULL,
  "action" VARCHAR(30) NOT NULL,
  "fromStatus" VARCHAR(30) NOT NULL,
  "toStatus" VARCHAR(30) NOT NULL,
  "actorUserId" UUID NOT NULL,
  "reason" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceWorkflowEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceWorkflowEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "FinanceWorkflowEvent_entityType_entityId_createdAt_idx" ON "FinanceWorkflowEvent"("entityType", "entityId", "createdAt");

CREATE TABLE "SupplierPayment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paymentNumber" VARCHAR(30) NOT NULL,
  "invoiceId" UUID,
  "supplierId" UUID NOT NULL,
  "status" VARCHAR(25) NOT NULL DEFAULT 'PREPARED',
  "method" VARCHAR(30) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "paymentDate" DATE NOT NULL,
  "bankAccountId" UUID,
  "referenceNumber" VARCHAR(120),
  "chequeNumber" VARCHAR(60),
  "chequeDate" DATE,
  "clearanceStatus" VARCHAR(30),
  "proofDocumentId" UUID NOT NULL,
  "preparedById" UUID NOT NULL,
  "approvedById" UUID,
  "reversalOfId" UUID,
  "reason" VARCHAR(1000) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierPayment_status_check" CHECK ("status" IN ('PREPARED','PENDING_APPROVAL','APPROVED','FAILED','VOIDED','REVERSED')),
  CONSTRAINT "SupplierPayment_method_check" CHECK ("method" IN ('NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','COMPANY_CARD','EMPLOYEE_REIMBURSEMENT')),
  CONSTRAINT "SupplierPayment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "SupplierPayment_reference_check" CHECK (
    ("method" IN ('NEFT','RTGS','IMPS','UPI','COMPANY_CARD','EMPLOYEE_REIMBURSEMENT') AND "referenceNumber" IS NOT NULL)
    OR ("method" = 'CHEQUE' AND "bankAccountId" IS NOT NULL AND "chequeNumber" IS NOT NULL AND "chequeDate" IS NOT NULL)
    OR ("method" = 'CASH')
  ),
  CONSTRAINT "SupplierPayment_bank_check" CHECK ("method" NOT IN ('NEFT','RTGS','IMPS','CHEQUE') OR "bankAccountId" IS NOT NULL),
  CONSTRAINT "SupplierPayment_approval_check" CHECK ("status" <> 'APPROVED' OR ("approvedById" IS NOT NULL AND "finalizedAt" IS NOT NULL AND "approvedById" <> "preparedById")),
  CONSTRAINT "SupplierPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierPayment_proofDocumentId_fkey" FOREIGN KEY ("proofDocumentId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierPayment_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierPayment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierPayment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierPayment_paymentNumber_key" ON "SupplierPayment"("paymentNumber");
CREATE UNIQUE INDEX "SupplierPayment_reversalOfId_key" ON "SupplierPayment"("reversalOfId");
CREATE INDEX "SupplierPayment_invoiceId_status_idx" ON "SupplierPayment"("invoiceId", "status");
CREATE INDEX "SupplierPayment_supplierId_paymentDate_idx" ON "SupplierPayment"("supplierId", "paymentDate");

CREATE TABLE "SupplierAdvance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "advanceNumber" VARCHAR(30) NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "status" VARCHAR(25) NOT NULL DEFAULT 'PENDING_APPROVAL',
  "advancePercent" DECIMAL(5,2) NOT NULL,
  "approvedAmount" DECIMAL(18,2) NOT NULL,
  "appliedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "refundedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "method" VARCHAR(30) NOT NULL,
  "referenceNumber" VARCHAR(120),
  "evidenceDocumentId" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "preparedById" UUID NOT NULL,
  "approvedById" UUID,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierAdvance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierAdvance_status_check" CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','PARTIALLY_APPLIED','APPLIED','REFUNDED','REVERSED','REJECTED')),
  CONSTRAINT "SupplierAdvance_amount_check" CHECK ("advancePercent" BETWEEN 0.01 AND 100 AND "approvedAmount" > 0 AND "appliedAmount" >= 0 AND "refundedAmount" >= 0 AND "appliedAmount" + "refundedAmount" <= "approvedAmount"),
  CONSTRAINT "SupplierAdvance_approval_check" CHECK ("status" NOT IN ('APPROVED','PARTIALLY_APPLIED','APPLIED','REFUNDED') OR ("approvedById" IS NOT NULL AND "approvedById" <> "preparedById" AND "finalizedAt" IS NOT NULL)),
  CONSTRAINT "SupplierAdvance_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierAdvance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierAdvance_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierAdvance_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierAdvance_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierAdvance_advanceNumber_key" ON "SupplierAdvance"("advanceNumber");
CREATE INDEX "SupplierAdvance_purchaseOrderId_status_idx" ON "SupplierAdvance"("purchaseOrderId", "status");
CREATE INDEX "SupplierAdvance_supplierId_status_idx" ON "SupplierAdvance"("supplierId", "status");

CREATE TABLE "SupplierAdvanceApplication" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "advanceId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "appliedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierAdvanceApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierAdvanceApplication_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "SupplierAdvanceApplication_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "SupplierAdvance"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierAdvanceApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierAdvanceApplication_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierAdvanceApplication_advanceId_invoiceId_key" ON "SupplierAdvanceApplication"("advanceId", "invoiceId");
CREATE INDEX "SupplierAdvanceApplication_invoiceId_idx" ON "SupplierAdvanceApplication"("invoiceId");

CREATE TABLE "SupplierFinancialNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "noteNumber" VARCHAR(30) NOT NULL,
  "noteType" VARCHAR(10) NOT NULL,
  "invoiceId" UUID NOT NULL,
  "goodsReceiptId" UUID,
  "supplierId" UUID NOT NULL,
  "financialYear" CHAR(5) NOT NULL,
  "reasonCode" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "taxableValue" DECIMAL(18,2) NOT NULL,
  "taxAmount" DECIMAL(18,2) NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL,
  "appliedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(25) NOT NULL DEFAULT 'DRAFT',
  "documentId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "approvedById" UUID,
  "reversalOfId" UUID,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierFinancialNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierFinancialNote_type_check" CHECK ("noteType" IN ('CREDIT','DEBIT')),
  CONSTRAINT "SupplierFinancialNote_reason_check" CHECK ("reasonCode" IN ('RETURN_TO_VENDOR','DAMAGED_REJECTED','PRICE_CORRECTION','QUANTITY_CORRECTION','GST_CORRECTION','DISCOUNT','FREIGHT_CORRECTION')),
  CONSTRAINT "SupplierFinancialNote_status_check" CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','REVERSED')),
  CONSTRAINT "SupplierFinancialNote_amount_check" CHECK ("taxableValue" >= 0 AND "taxAmount" >= 0 AND "totalAmount" > 0 AND "appliedAmount" BETWEEN 0 AND "totalAmount"),
  CONSTRAINT "SupplierFinancialNote_approval_check" CHECK ("status" <> 'APPROVED' OR ("approvedById" IS NOT NULL AND "finalizedAt" IS NOT NULL)),
  CONSTRAINT "SupplierFinancialNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNote_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNote_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNote_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "SupplierFinancialNote"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "SupplierFinancialNote_noteNumber_key" ON "SupplierFinancialNote"("noteNumber");
CREATE UNIQUE INDEX "SupplierFinancialNote_reversalOfId_key" ON "SupplierFinancialNote"("reversalOfId");
CREATE INDEX "SupplierFinancialNote_invoiceId_status_idx" ON "SupplierFinancialNote"("invoiceId", "status");
CREATE INDEX "SupplierFinancialNote_supplierId_financialYear_idx" ON "SupplierFinancialNote"("supplierId", "financialYear");

CREATE TABLE "SupplierFinancialNoteLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "noteId" UUID NOT NULL,
  "invoiceLineId" UUID NOT NULL,
  "hsnSac" VARCHAR(20) NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "taxableValue" DECIMAL(18,2) NOT NULL,
  "taxRuleVersionId" UUID NOT NULL,
  "gstRate" DECIMAL(7,4) NOT NULL,
  "taxAmount" DECIMAL(18,2) NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierFinancialNoteLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierFinancialNoteLine_amount_check" CHECK ("quantity" > 0 AND "taxableValue" >= 0 AND "gstRate" BETWEEN 0 AND 100 AND "taxAmount" >= 0 AND "totalAmount" > 0),
  CONSTRAINT "SupplierFinancialNoteLine_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "SupplierFinancialNote"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNoteLine_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "SupplierInvoiceLine"("id") ON DELETE RESTRICT,
  CONSTRAINT "SupplierFinancialNoteLine_taxRuleVersionId_fkey" FOREIGN KEY ("taxRuleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT
);
CREATE INDEX "SupplierFinancialNoteLine_noteId_idx" ON "SupplierFinancialNoteLine"("noteId");
CREATE INDEX "SupplierFinancialNoteLine_invoiceLineId_idx" ON "SupplierFinancialNoteLine"("invoiceLineId");

CREATE TABLE "FinancialBalanceEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "supplierId" UUID NOT NULL,
  "invoiceId" UUID,
  "entityType" VARCHAR(30) NOT NULL,
  "entityId" UUID NOT NULL,
  "direction" CHAR(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialBalanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialBalanceEvent_direction_check" CHECK ("direction" IN ('IN','OUT')),
  CONSTRAINT "FinancialBalanceEvent_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "FinancialBalanceEvent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialBalanceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialBalanceEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "FinancialBalanceEvent_entityType_entityId_direction_key" ON "FinancialBalanceEvent"("entityType", "entityId", "direction");
CREATE INDEX "FinancialBalanceEvent_supplierId_createdAt_idx" ON "FinancialBalanceEvent"("supplierId", "createdAt");
CREATE INDEX "FinancialBalanceEvent_invoiceId_createdAt_idx" ON "FinancialBalanceEvent"("invoiceId", "createdAt");

CREATE TABLE "ProjectCostAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceLineId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "workPackage" VARCHAR(160),
  "amount" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectCostAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectCostAllocation_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "ProjectCostAllocation_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "SupplierInvoiceLine"("id") ON DELETE RESTRICT,
  CONSTRAINT "ProjectCostAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "ProjectCostAllocation_line_project_work_key" ON "ProjectCostAllocation"("invoiceLineId", "projectId", COALESCE("workPackage", ''));
CREATE INDEX "ProjectCostAllocation_projectId_createdAt_idx" ON "ProjectCostAllocation"("projectId", "createdAt");

CREATE TABLE "TallyExportEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "exportNumber" VARCHAR(30) NOT NULL,
  "entityType" VARCHAR(30) NOT NULL,
  "entityId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "payload" TEXT NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallyExportEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TallyExportEvent_status_check" CHECK ("status" IN ('PENDING','PROCESSING','EXPORTED','ACKNOWLEDGED','FAILED','RETRY_PENDING')),
  CONSTRAINT "TallyExportEvent_attempt_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "TallyExportEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "TallyExportEvent_exportNumber_key" ON "TallyExportEvent"("exportNumber");
CREATE UNIQUE INDEX "TallyExportEvent_idempotencyKey_key" ON "TallyExportEvent"("idempotencyKey");
CREATE INDEX "TallyExportEvent_status_createdAt_idx" ON "TallyExportEvent"("status", "createdAt");
CREATE INDEX "TallyExportEvent_entityType_entityId_idx" ON "TallyExportEvent"("entityType", "entityId");

CREATE TABLE "TallyExportAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "exportEventId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "payload" TEXT NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "error" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallyExportAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TallyExportAttempt_attempt_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "TallyExportAttempt_exportEventId_fkey" FOREIGN KEY ("exportEventId") REFERENCES "TallyExportEvent"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "TallyExportAttempt_exportEventId_attemptNumber_key" ON "TallyExportAttempt"("exportEventId", "attemptNumber");

CREATE TABLE "FinanceDocument" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entityType" VARCHAR(30) NOT NULL,
  "entityId" UUID NOT NULL,
  "purpose" VARCHAR(40) NOT NULL,
  "fileRecordId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceDocument_fileRecordId_fkey" FOREIGN KEY ("fileRecordId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "FinanceDocument_fileRecordId_key" ON "FinanceDocument"("fileRecordId");
CREATE INDEX "FinanceDocument_entityType_entityId_idx" ON "FinanceDocument"("entityType", "entityId");

CREATE TABLE "NotificationOutbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dedupeKey" VARCHAR(180),
  "eventType" VARCHAR(50) NOT NULL,
  "entityType" VARCHAR(30) NOT NULL,
  "entityId" UUID NOT NULL,
  "recipientRole" VARCHAR(80) NOT NULL,
  "channels" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remindAt" TIMESTAMP(3),
  "escalateAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationOutbox_status_check" CHECK ("status" IN ('PENDING','PROCESSING','SENT','FAILED')),
  CONSTRAINT "NotificationOutbox_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");
CREATE INDEX "NotificationOutbox_entityType_entityId_idx" ON "NotificationOutbox"("entityType", "entityId");

CREATE OR REPLACE FUNCTION kdipl_phase7_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Phase 7 financial event history is append-only';
END;
$$;

CREATE TRIGGER "FinanceWorkflowEvent_append_only"
BEFORE UPDATE OR DELETE ON "FinanceWorkflowEvent"
FOR EACH ROW EXECUTE FUNCTION kdipl_phase7_append_only();
CREATE TRIGGER "FinancialBalanceEvent_append_only"
BEFORE UPDATE OR DELETE ON "FinancialBalanceEvent"
FOR EACH ROW EXECUTE FUNCTION kdipl_phase7_append_only();
CREATE TRIGGER "TallyExportAttempt_append_only"
BEFORE UPDATE OR DELETE ON "TallyExportAttempt"
FOR EACH ROW EXECUTE FUNCTION kdipl_phase7_append_only();
CREATE TRIGGER "TaxRuleVersion_append_only"
BEFORE UPDATE OR DELETE ON "TaxRuleVersion"
FOR EACH ROW EXECUTE FUNCTION kdipl_phase7_append_only();

CREATE OR REPLACE FUNCTION kdipl_guard_finalized_invoice()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Submitted supplier invoices cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('APPROVED','PARTIALLY_PAID','PAID','PAYMENT_HOLD') AND (
    NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR
    NEW."supplierInvoiceNumber" IS DISTINCT FROM OLD."supplierInvoiceNumber" OR
    NEW."invoiceDate" IS DISTINCT FROM OLD."invoiceDate" OR
    NEW."placeOfSupply" IS DISTINCT FROM OLD."placeOfSupply" OR
    NEW."invoiceTotal" IS DISTINCT FROM OLD."invoiceTotal" OR
    NEW."taxRuleSnapshot" IS DISTINCT FROM OLD."taxRuleSnapshot"
  ) THEN
    RAISE EXCEPTION 'Finalized supplier invoice values are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SupplierInvoice_finalized_guard"
BEFORE UPDATE OR DELETE ON "SupplierInvoice"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_finalized_invoice();

CREATE OR REPLACE FUNCTION kdipl_guard_finalized_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" <> 'PREPARED' THEN
    RAISE EXCEPTION 'Submitted supplier payments cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" IN ('APPROVED','VOIDED','REVERSED') AND (
    NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR
    NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR
    NEW."method" IS DISTINCT FROM OLD."method" OR
    NEW."amount" IS DISTINCT FROM OLD."amount" OR
    NEW."paymentDate" IS DISTINCT FROM OLD."paymentDate" OR
    NEW."proofDocumentId" IS DISTINCT FROM OLD."proofDocumentId"
  ) THEN
    RAISE EXCEPTION 'Finalized supplier payment values are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SupplierPayment_finalized_guard"
BEFORE UPDATE OR DELETE ON "SupplierPayment"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_finalized_payment();

CREATE OR REPLACE FUNCTION kdipl_guard_invoice_line()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status TEXT;
BEGIN
  SELECT "status" INTO parent_status
  FROM "SupplierInvoice"
  WHERE "id" = COALESCE(NEW."invoiceId", OLD."invoiceId");

  IF parent_status <> 'DRAFT' AND TG_OP IN ('INSERT', 'DELETE') THEN
    RAISE EXCEPTION 'Submitted supplier invoice lines are immutable';
  END IF;
  IF parent_status <> 'DRAFT' AND TG_OP = 'UPDATE' AND (
    NEW."purchaseOrderLineId" IS DISTINCT FROM OLD."purchaseOrderLineId" OR
    NEW."materialId" IS DISTINCT FROM OLD."materialId" OR
    NEW."unitId" IS DISTINCT FROM OLD."unitId" OR
    NEW."hsnSac" IS DISTINCT FROM OLD."hsnSac" OR
    NEW."taxRuleVersionId" IS DISTINCT FROM OLD."taxRuleVersionId" OR
    NEW."tdsRuleVersionId" IS DISTINCT FROM OLD."tdsRuleVersionId" OR
    NEW."cessRuleVersionId" IS DISTINCT FROM OLD."cessRuleVersionId" OR
    NEW."quantity" IS DISTINCT FROM OLD."quantity" OR
    NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice" OR
    NEW."discountBeforeTax" IS DISTINCT FROM OLD."discountBeforeTax" OR
    NEW."discountAfterTax" IS DISTINCT FROM OLD."discountAfterTax" OR
    NEW."freightAmount" IS DISTINCT FROM OLD."freightAmount" OR
    NEW."freightTaxable" IS DISTINCT FROM OLD."freightTaxable" OR
    NEW."taxableValue" IS DISTINCT FROM OLD."taxableValue" OR
    NEW."gstRate" IS DISTINCT FROM OLD."gstRate" OR
    NEW."cgstAmount" IS DISTINCT FROM OLD."cgstAmount" OR
    NEW."sgstAmount" IS DISTINCT FROM OLD."sgstAmount" OR
    NEW."igstAmount" IS DISTINCT FROM OLD."igstAmount" OR
    NEW."cessRate" IS DISTINCT FROM OLD."cessRate" OR
    NEW."cessAmount" IS DISTINCT FROM OLD."cessAmount" OR
    NEW."tdsRate" IS DISTINCT FROM OLD."tdsRate" OR
    NEW."tdsAmount" IS DISTINCT FROM OLD."tdsAmount" OR
    NEW."reverseCharge" IS DISTINCT FROM OLD."reverseCharge" OR
    NEW."inputTaxCreditEligible" IS DISTINCT FROM OLD."inputTaxCreditEligible" OR
    NEW."linePayable" IS DISTINCT FROM OLD."linePayable"
  ) THEN
    RAISE EXCEPTION 'Submitted supplier invoice line values are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SupplierInvoiceLine_finalized_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierInvoiceLine"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_invoice_line();

CREATE OR REPLACE FUNCTION kdipl_guard_invoice_child()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_id UUID;
DECLARE parent_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'SupplierInvoiceAllocation' THEN
    SELECT "invoiceId" INTO invoice_id FROM "SupplierInvoiceLine"
    WHERE "id" = COALESCE(NEW."invoiceLineId", OLD."invoiceLineId");
  ELSE
    invoice_id := COALESCE(NEW."invoiceId", OLD."invoiceId");
  END IF;
  SELECT "status" INTO parent_status FROM "SupplierInvoice" WHERE "id" = invoice_id;
  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Submitted supplier invoice links and allocations are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SupplierInvoicePurchaseOrder_finalized_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierInvoicePurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_invoice_child();
CREATE TRIGGER "SupplierInvoiceGoodsReceipt_finalized_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierInvoiceGoodsReceipt"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_invoice_child();
CREATE TRIGGER "SupplierInvoiceAllocation_finalized_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierInvoiceAllocation"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_invoice_child();

CREATE OR REPLACE FUNCTION kdipl_guard_advance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Supplier advances cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."purchaseOrderId" IS DISTINCT FROM OLD."purchaseOrderId" OR
    NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR
    NEW."advancePercent" IS DISTINCT FROM OLD."advancePercent" OR
    NEW."approvedAmount" IS DISTINCT FROM OLD."approvedAmount" OR
    NEW."method" IS DISTINCT FROM OLD."method" OR
    NEW."referenceNumber" IS DISTINCT FROM OLD."referenceNumber" OR
    NEW."evidenceDocumentId" IS DISTINCT FROM OLD."evidenceDocumentId" OR
    NEW."reason" IS DISTINCT FROM OLD."reason" OR
    NEW."preparedById" IS DISTINCT FROM OLD."preparedById"
  ) THEN
    RAISE EXCEPTION 'Submitted supplier advance values are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SupplierAdvance_finalized_guard"
BEFORE UPDATE OR DELETE ON "SupplierAdvance"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_advance();

CREATE OR REPLACE FUNCTION kdipl_guard_financial_note()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Submitted financial notes cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" <> 'DRAFT' AND (
    NEW."noteType" IS DISTINCT FROM OLD."noteType" OR
    NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR
    NEW."goodsReceiptId" IS DISTINCT FROM OLD."goodsReceiptId" OR
    NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR
    NEW."financialYear" IS DISTINCT FROM OLD."financialYear" OR
    NEW."reasonCode" IS DISTINCT FROM OLD."reasonCode" OR
    NEW."reason" IS DISTINCT FROM OLD."reason" OR
    NEW."taxableValue" IS DISTINCT FROM OLD."taxableValue" OR
    NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount" OR
    NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount" OR
    NEW."documentId" IS DISTINCT FROM OLD."documentId" OR
    NEW."createdById" IS DISTINCT FROM OLD."createdById"
  ) THEN
    RAISE EXCEPTION 'Submitted financial note values are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SupplierFinancialNote_finalized_guard"
BEFORE UPDATE OR DELETE ON "SupplierFinancialNote"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_financial_note();

CREATE OR REPLACE FUNCTION kdipl_guard_financial_note_line()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status TEXT;
BEGIN
  SELECT "status" INTO parent_status FROM "SupplierFinancialNote"
  WHERE "id" = COALESCE(NEW."noteId", OLD."noteId");
  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Submitted financial note lines are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "SupplierFinancialNoteLine_finalized_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierFinancialNoteLine"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_financial_note_line();

CREATE OR REPLACE FUNCTION kdipl_guard_tally_payload()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Tally export events cannot be deleted';
  END IF;
  IF NEW."entityType" IS DISTINCT FROM OLD."entityType" OR
     NEW."entityId" IS DISTINCT FROM OLD."entityId" OR
     NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
     NEW."payload" IS DISTINCT FROM OLD."payload" OR
     NEW."checksum" IS DISTINCT FROM OLD."checksum" OR
     NEW."createdById" IS DISTINCT FROM OLD."createdById" THEN
    RAISE EXCEPTION 'Tally export payload and checksum are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TallyExportEvent_payload_guard"
BEFORE UPDATE OR DELETE ON "TallyExportEvent"
FOR EACH ROW EXECUTE FUNCTION kdipl_guard_tally_payload();
