ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECOMMEND';
ALTER TYPE "RequestForQuotationStatus" ADD VALUE IF NOT EXISTS 'ISSUED';
ALTER TYPE "RequestForQuotationStatus" ADD VALUE IF NOT EXISTS 'RECOMMENDED';
ALTER TYPE "RequestForQuotationStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "RequestForQuotationStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "RequestForQuotationStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "RequestForQuotationWorkflowAction" AS ENUM ('ISSUE', 'RECOMMEND', 'APPROVE', 'REJECT', 'SEND_BACK', 'CANCEL');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT');

ALTER TABLE "RequestForQuotation"
ADD COLUMN "issuedById" UUID,
ADD COLUMN "issuedAt" TIMESTAMP(3),
ADD COLUMN "recommendedQuotationId" UUID,
ADD COLUMN "recommendedById" UUID,
ADD COLUMN "recommendedAt" TIMESTAMP(3),
ADD COLUMN "recommendationReason" VARCHAR(1000),
ADD COLUMN "decidedById" UUID,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decisionReason" VARCHAR(1000);

CREATE TABLE "RequestForQuotationWorkflowEvent" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "action" "RequestForQuotationWorkflowAction" NOT NULL,
    "fromStatus" "RequestForQuotationStatus" NOT NULL,
    "toStatus" "RequestForQuotationStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestForQuotationWorkflowEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RequestForQuotationWorkflowEvent_transition_check" CHECK (
        ("action" = 'ISSUE' AND "fromStatus" = 'DRAFT' AND "toStatus" = 'ISSUED') OR
        ("action" = 'RECOMMEND' AND "fromStatus" = 'ISSUED' AND "toStatus" = 'RECOMMENDED' AND LENGTH(BTRIM("reason")) > 0) OR
        ("action" = 'APPROVE' AND "fromStatus" = 'RECOMMENDED' AND "toStatus" = 'APPROVED') OR
        ("action" = 'REJECT' AND "fromStatus" = 'RECOMMENDED' AND "toStatus" = 'REJECTED' AND LENGTH(BTRIM("reason")) > 0) OR
        ("action" = 'SEND_BACK' AND "fromStatus" = 'RECOMMENDED' AND "toStatus" = 'ISSUED' AND LENGTH(BTRIM("reason")) > 0) OR
        ("action" = 'CANCEL' AND "fromStatus" IN ('DRAFT', 'ISSUED') AND "toStatus" = 'CANCELLED' AND LENGTH(BTRIM("reason")) > 0)
    )
);

CREATE TABLE "SupplierQuotation" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "quoteReference" VARCHAR(100) NOT NULL,
    "quoteDate" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "offeredDeliveryDate" DATE NOT NULL,
    "paymentTerms" VARCHAR(500) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(18,2) NOT NULL,
    "freightAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "landedTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierQuotation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupplierQuotation_dates_check" CHECK (
        "validUntil" >= "quoteDate" AND "offeredDeliveryDate" >= "quoteDate"
    ),
    CONSTRAINT "SupplierQuotation_amounts_check" CHECK (
        "subtotal" >= 0 AND "gstRate" >= 0 AND "gstRate" <= 100 AND
        "gstAmount" >= 0 AND "freightAmount" >= 0 AND
        "landedTotal" = "subtotal" + "gstAmount" + "freightAmount"
    ),
    CONSTRAINT "SupplierQuotation_currency_check" CHECK ("currency" = 'INR')
);

CREATE TABLE "SupplierQuotationLine" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "requirementLineId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineSubtotal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierQuotationLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupplierQuotationLine_amounts_check" CHECK (
        "quantity" > 0 AND "unitPrice" >= 0 AND "lineSubtotal" >= 0
    )
);

CREATE TABLE "SupplierQuotationDocument" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "fileRecordId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierQuotationDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "poNumber" VARCHAR(30) NOT NULL,
    "rfqId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "gstAmount" DECIMAL(18,2) NOT NULL,
    "freightAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "expectedDeliveryDate" DATE NOT NULL,
    "paymentTerms" VARCHAR(500) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrder_amounts_check" CHECK (
        "subtotal" >= 0 AND "gstRate" >= 0 AND "gstRate" <= 100 AND
        "gstAmount" >= 0 AND "freightAmount" >= 0 AND
        "totalAmount" = "subtotal" + "gstAmount" + "freightAmount"
    ),
    CONSTRAINT "PurchaseOrder_currency_check" CHECK ("currency" = 'INR')
);

CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "quotationLineId" UUID NOT NULL,
    "requirementLineId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineSubtotal" DECIMAL(18,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseOrderLine_amounts_check" CHECK (
        "quantity" > 0 AND "unitPrice" >= 0 AND "lineSubtotal" >= 0
    )
);

CREATE UNIQUE INDEX "RequestForQuotation_recommendedQuotationId_key" ON "RequestForQuotation"("recommendedQuotationId");
CREATE INDEX "RequestForQuotation_issuedById_issuedAt_idx" ON "RequestForQuotation"("issuedById", "issuedAt");
CREATE INDEX "RequestForQuotation_recommendedById_recommendedAt_idx" ON "RequestForQuotation"("recommendedById", "recommendedAt");
CREATE INDEX "RequestForQuotation_decidedById_decidedAt_idx" ON "RequestForQuotation"("decidedById", "decidedAt");
CREATE INDEX "RequestForQuotationWorkflowEvent_rfqId_createdAt_idx" ON "RequestForQuotationWorkflowEvent"("rfqId", "createdAt");
CREATE INDEX "RequestForQuotationWorkflowEvent_actorUserId_createdAt_idx" ON "RequestForQuotationWorkflowEvent"("actorUserId", "createdAt");
CREATE INDEX "RequestForQuotationWorkflowEvent_action_createdAt_idx" ON "RequestForQuotationWorkflowEvent"("action", "createdAt");
CREATE UNIQUE INDEX "SupplierQuotation_rfqId_supplierId_key" ON "SupplierQuotation"("rfqId", "supplierId");
CREATE UNIQUE INDEX "SupplierQuotation_supplierId_quoteReference_key" ON "SupplierQuotation"("supplierId", "quoteReference");
CREATE INDEX "SupplierQuotation_rfqId_landedTotal_idx" ON "SupplierQuotation"("rfqId", "landedTotal");
CREATE INDEX "SupplierQuotation_supplierId_quoteDate_idx" ON "SupplierQuotation"("supplierId", "quoteDate");
CREATE INDEX "SupplierQuotation_recordedById_createdAt_idx" ON "SupplierQuotation"("recordedById", "createdAt");
CREATE UNIQUE INDEX "SupplierQuotationLine_quotationId_requirementLineId_key" ON "SupplierQuotationLine"("quotationId", "requirementLineId");
CREATE INDEX "SupplierQuotationLine_requirementLineId_idx" ON "SupplierQuotationLine"("requirementLineId");
CREATE INDEX "SupplierQuotationLine_unitId_idx" ON "SupplierQuotationLine"("unitId");
CREATE UNIQUE INDEX "SupplierQuotationDocument_fileRecordId_key" ON "SupplierQuotationDocument"("fileRecordId");
CREATE INDEX "SupplierQuotationDocument_quotationId_createdAt_idx" ON "SupplierQuotationDocument"("quotationId", "createdAt");
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE UNIQUE INDEX "PurchaseOrder_rfqId_key" ON "PurchaseOrder"("rfqId");
CREATE UNIQUE INDEX "PurchaseOrder_quotationId_key" ON "PurchaseOrder"("quotationId");
CREATE INDEX "PurchaseOrder_supplierId_status_idx" ON "PurchaseOrder"("supplierId", "status");
CREATE INDEX "PurchaseOrder_createdById_createdAt_idx" ON "PurchaseOrder"("createdById", "createdAt");
CREATE UNIQUE INDEX "PurchaseOrderLine_quotationLineId_key" ON "PurchaseOrderLine"("quotationLineId");
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_requirementLineId_key" ON "PurchaseOrderLine"("purchaseOrderId", "requirementLineId");
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_position_idx" ON "PurchaseOrderLine"("purchaseOrderId", "position");
CREATE INDEX "PurchaseOrderLine_requirementLineId_idx" ON "PurchaseOrderLine"("requirementLineId");
CREATE INDEX "PurchaseOrderLine_unitId_idx" ON "PurchaseOrderLine"("unitId");

ALTER TABLE "RequestForQuotation" ADD CONSTRAINT "RequestForQuotation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotation" ADD CONSTRAINT "RequestForQuotation_recommendedQuotationId_fkey" FOREIGN KEY ("recommendedQuotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotation" ADD CONSTRAINT "RequestForQuotation_recommendedById_fkey" FOREIGN KEY ("recommendedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotation" ADD CONSTRAINT "RequestForQuotation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotationWorkflowEvent" ADD CONSTRAINT "RequestForQuotationWorkflowEvent_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RequestForQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestForQuotationWorkflowEvent" ADD CONSTRAINT "RequestForQuotationWorkflowEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RequestForQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_requirementLineId_fkey" FOREIGN KEY ("requirementLineId") REFERENCES "MaterialRequirementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationLine" ADD CONSTRAINT "SupplierQuotationLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationDocument" ADD CONSTRAINT "SupplierQuotationDocument_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierQuotationDocument" ADD CONSTRAINT "SupplierQuotationDocument_fileRecordId_fkey" FOREIGN KEY ("fileRecordId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RequestForQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SupplierQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_quotationLineId_fkey" FOREIGN KEY ("quotationLineId") REFERENCES "SupplierQuotationLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_requirementLineId_fkey" FOREIGN KEY ("requirementLineId") REFERENCES "MaterialRequirementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequestForQuotation" ADD CONSTRAINT "RequestForQuotation_workflow_state_check" CHECK (
    ("status" = 'DRAFT' AND "issuedById" IS NULL AND "issuedAt" IS NULL AND "recommendedQuotationId" IS NULL AND "recommendedById" IS NULL AND "recommendedAt" IS NULL AND "recommendationReason" IS NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL) OR
    ("status" = 'ISSUED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "recommendedQuotationId" IS NULL AND "recommendedById" IS NULL AND "recommendedAt" IS NULL AND "recommendationReason" IS NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL) OR
    ("status" = 'RECOMMENDED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "recommendedQuotationId" IS NOT NULL AND "recommendedById" IS NOT NULL AND "recommendedAt" IS NOT NULL AND LENGTH(BTRIM("recommendationReason")) > 0 AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL) OR
    ("status" = 'APPROVED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "recommendedQuotationId" IS NOT NULL AND "recommendedById" IS NOT NULL AND "recommendedAt" IS NOT NULL AND LENGTH(BTRIM("recommendationReason")) > 0 AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL) OR
    ("status" = 'REJECTED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "recommendedQuotationId" IS NOT NULL AND "recommendedById" IS NOT NULL AND "recommendedAt" IS NOT NULL AND LENGTH(BTRIM("recommendationReason")) > 0 AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND LENGTH(BTRIM("decisionReason")) > 0) OR
    ("status" = 'CANCELLED' AND "recommendedQuotationId" IS NULL AND "recommendedById" IS NULL AND "recommendedAt" IS NULL AND "recommendationReason" IS NULL AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND LENGTH(BTRIM("decisionReason")) > 0 AND (("issuedById" IS NULL AND "issuedAt" IS NULL) OR ("issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL)))
);
