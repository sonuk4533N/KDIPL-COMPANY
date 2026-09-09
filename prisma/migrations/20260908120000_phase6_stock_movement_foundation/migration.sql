-- CreateEnum
CREATE TYPE "MaterialIssueStatus" AS ENUM ('DRAFT', 'POSTED', 'ACKNOWLEDGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransferPurpose" AS ENUM ('ROUTINE', 'PROJECT_CLOSE');

-- CreateEnum
CREATE TYPE "StockAdjustmentDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "StockAdjustmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialReconciliationStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "StockTransactionType" ADD VALUE 'RETURN';

-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN     "materialIssueLineId" UUID,
ADD COLUMN     "reconciliationId" UUID,
ADD COLUMN     "stockAdjustmentId" UUID,
ADD COLUMN     "stockCountLineId" UUID,
ADD COLUMN     "stockTransferLineId" UUID;

-- CreateTable
CREATE TABLE "MaterialIssue" (
    "id" UUID NOT NULL,
    "issueNumber" VARCHAR(30) NOT NULL,
    "sourceLocationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "siteId" UUID,
    "status" "MaterialIssueStatus" NOT NULL DEFAULT 'DRAFT',
    "purpose" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMP(3),
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIssueLine" (
    "id" UUID NOT NULL,
    "materialIssueId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialIssueLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" UUID NOT NULL,
    "transferNumber" VARCHAR(30) NOT NULL,
    "sourceLocationId" UUID NOT NULL,
    "destinationLocationId" UUID NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "purpose" "StockTransferPurpose" NOT NULL DEFAULT 'ROUTINE',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "dispatchedById" UUID,
    "dispatchedAt" TIMESTAMP(3),
    "receivedById" UUID,
    "receivedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" UUID NOT NULL,
    "stockTransferId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "adjustmentNumber" VARCHAR(30) NOT NULL,
    "locationId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "direction" "StockAdjustmentDirection" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "StockAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" VARCHAR(1000),
    "postedById" UUID,
    "postedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" UUID NOT NULL,
    "countNumber" VARCHAR(30) NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "countedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" VARCHAR(1000),
    "postedById" UUID,
    "postedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "bookQuantity" DECIMAL(18,3) NOT NULL,
    "countedQuantity" DECIMAL(18,3) NOT NULL,
    "varianceQuantity" DECIMAL(18,3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReconciliation" (
    "id" UUID NOT NULL,
    "reconciliationNumber" VARCHAR(30) NOT NULL,
    "materialIssueLineId" UUID NOT NULL,
    "returnLocationId" UUID,
    "status" "MaterialReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "consumedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "wastageQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "scrapQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" VARCHAR(1000),
    "createdById" UUID NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_issueNumber_key" ON "MaterialIssue"("issueNumber");

-- CreateIndex
CREATE INDEX "MaterialIssue_sourceLocationId_status_idx" ON "MaterialIssue"("sourceLocationId", "status");

-- CreateIndex
CREATE INDEX "MaterialIssue_projectId_siteId_status_idx" ON "MaterialIssue"("projectId", "siteId", "status");

-- CreateIndex
CREATE INDEX "MaterialIssueLine_materialIssueId_position_idx" ON "MaterialIssueLine"("materialIssueId", "position");

-- CreateIndex
CREATE INDEX "MaterialIssueLine_materialId_idx" ON "MaterialIssueLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssueLine_materialIssueId_materialId_unitId_key" ON "MaterialIssueLine"("materialIssueId", "materialId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_transferNumber_key" ON "StockTransfer"("transferNumber");

-- CreateIndex
CREATE INDEX "StockTransfer_sourceLocationId_status_idx" ON "StockTransfer"("sourceLocationId", "status");

-- CreateIndex
CREATE INDEX "StockTransfer_destinationLocationId_status_idx" ON "StockTransfer"("destinationLocationId", "status");

-- CreateIndex
CREATE INDEX "StockTransferLine_stockTransferId_position_idx" ON "StockTransferLine"("stockTransferId", "position");

-- CreateIndex
CREATE INDEX "StockTransferLine_materialId_idx" ON "StockTransferLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferLine_stockTransferId_materialId_unitId_key" ON "StockTransferLine"("stockTransferId", "materialId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_adjustmentNumber_key" ON "StockAdjustment"("adjustmentNumber");

-- CreateIndex
CREATE INDEX "StockAdjustment_locationId_status_idx" ON "StockAdjustment"("locationId", "status");

-- CreateIndex
CREATE INDEX "StockAdjustment_materialId_status_idx" ON "StockAdjustment"("materialId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_countNumber_key" ON "StockCount"("countNumber");

-- CreateIndex
CREATE INDEX "StockCount_locationId_status_countedAt_idx" ON "StockCount"("locationId", "status", "countedAt");

-- CreateIndex
CREATE INDEX "StockCountLine_stockCountId_position_idx" ON "StockCountLine"("stockCountId", "position");

-- CreateIndex
CREATE INDEX "StockCountLine_materialId_idx" ON "StockCountLine"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_stockCountId_materialId_unitId_key" ON "StockCountLine"("stockCountId", "materialId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReconciliation_reconciliationNumber_key" ON "MaterialReconciliation"("reconciliationNumber");

-- CreateIndex
CREATE INDEX "MaterialReconciliation_materialIssueLineId_status_idx" ON "MaterialReconciliation"("materialIssueLineId", "status");

-- CreateIndex
CREATE INDEX "MaterialReconciliation_returnLocationId_status_idx" ON "MaterialReconciliation"("returnLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransaction_stockAdjustmentId_key" ON "StockTransaction"("stockAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransaction_stockCountLineId_key" ON "StockTransaction"("stockCountLineId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransaction_reconciliationId_key" ON "StockTransaction"("reconciliationId");

-- CreateIndex
CREATE INDEX "StockTransaction_materialIssueLineId_idx" ON "StockTransaction"("materialIssueLineId");

-- CreateIndex
CREATE INDEX "StockTransaction_stockTransferLineId_idx" ON "StockTransaction"("stockTransferLineId");

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_siteId_projectId_fkey" FOREIGN KEY ("siteId", "projectId") REFERENCES "Site"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssueLine" ADD CONSTRAINT "MaterialIssueLine_materialIssueId_fkey" FOREIGN KEY ("materialIssueId") REFERENCES "MaterialIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssueLine" ADD CONSTRAINT "MaterialIssueLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssueLine" ADD CONSTRAINT "MaterialIssueLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReconciliation" ADD CONSTRAINT "MaterialReconciliation_materialIssueLineId_fkey" FOREIGN KEY ("materialIssueLineId") REFERENCES "MaterialIssueLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReconciliation" ADD CONSTRAINT "MaterialReconciliation_returnLocationId_fkey" FOREIGN KEY ("returnLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReconciliation" ADD CONSTRAINT "MaterialReconciliation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReconciliation" ADD CONSTRAINT "MaterialReconciliation_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReconciliation" ADD CONSTRAINT "MaterialReconciliation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_materialIssueLineId_fkey" FOREIGN KEY ("materialIssueLineId") REFERENCES "MaterialIssueLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_stockTransferLineId_fkey" FOREIGN KEY ("stockTransferLineId") REFERENCES "StockTransferLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_stockAdjustmentId_fkey" FOREIGN KEY ("stockAdjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_stockCountLineId_fkey" FOREIGN KEY ("stockCountLineId") REFERENCES "StockCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "MaterialReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 6 quantities and evidence are accounting facts, so malformed records
-- are rejected even when written outside the application command layer.
ALTER TABLE "MaterialIssueLine"
  ADD CONSTRAINT "MaterialIssueLine_positive_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_distinct_locations_check" CHECK ("sourceLocationId" <> "destinationLocationId");

ALTER TABLE "StockTransferLine"
  ADD CONSTRAINT "StockTransferLine_positive_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_positive_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "StockAdjustment_reason_check" CHECK (LENGTH(BTRIM("reason")) > 0);

ALTER TABLE "StockCountLine"
  ADD CONSTRAINT "StockCountLine_quantity_check" CHECK (
    "bookQuantity" >= 0
    AND "countedQuantity" >= 0
    AND "varianceQuantity" = "countedQuantity" - "bookQuantity"
  );

ALTER TABLE "MaterialReconciliation"
  ADD CONSTRAINT "MaterialReconciliation_quantity_check" CHECK (
    "consumedQuantity" >= 0
    AND "returnedQuantity" >= 0
    AND "wastageQuantity" >= 0
    AND "scrapQuantity" >= 0
    AND "consumedQuantity" + "returnedQuantity" + "wastageQuantity" + "scrapQuantity" > 0
  ),
  ADD CONSTRAINT "MaterialReconciliation_return_location_check" CHECK (
    ("returnedQuantity" = 0 AND "returnLocationId" IS NULL)
    OR ("returnedQuantity" > 0 AND "returnLocationId" IS NOT NULL)
  );

ALTER TABLE "MaterialIssue"
  ADD CONSTRAINT "MaterialIssue_status_evidence_check" CHECK (
    ("status" = 'DRAFT' AND "postedById" IS NULL AND "postedAt" IS NULL AND "acknowledgedById" IS NULL AND "acknowledgedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'POSTED' AND "postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "acknowledgedById" IS NULL AND "acknowledgedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'ACKNOWLEDGED' AND "postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "acknowledgedById" IS NOT NULL AND "acknowledgedAt" IS NOT NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'CANCELLED' AND "postedById" IS NULL AND "postedAt" IS NULL AND "acknowledgedById" IS NULL AND "acknowledgedAt" IS NULL AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0)
  );

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_status_evidence_check" CHECK (
    ("status" = 'DRAFT' AND "dispatchedById" IS NULL AND "dispatchedAt" IS NULL AND "receivedById" IS NULL AND "receivedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'DISPATCHED' AND "dispatchedById" IS NOT NULL AND "dispatchedAt" IS NOT NULL AND "receivedById" IS NULL AND "receivedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'RECEIVED' AND "dispatchedById" IS NOT NULL AND "dispatchedAt" IS NOT NULL AND "receivedById" IS NOT NULL AND "receivedAt" IS NOT NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'CANCELLED' AND "dispatchedById" IS NULL AND "dispatchedAt" IS NULL AND "receivedById" IS NULL AND "receivedAt" IS NULL AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0)
  );

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_status_evidence_check" CHECK (
    ("status" = 'DRAFT' AND "submittedById" IS NULL AND "submittedAt" IS NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'SUBMITTED' AND "submittedById" IS NOT NULL AND "submittedAt" IS NOT NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" IN ('APPROVED', 'REJECTED') AND "submittedById" IS NOT NULL AND "submittedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'POSTED' AND "submittedById" IS NOT NULL AND "submittedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'CANCELLED' AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0)
  );

ALTER TABLE "StockCount"
  ADD CONSTRAINT "StockCount_status_evidence_check" CHECK (
    ("status" = 'DRAFT' AND "submittedById" IS NULL AND "submittedAt" IS NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'SUBMITTED' AND "submittedById" IS NOT NULL AND "submittedAt" IS NOT NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" IN ('APPROVED', 'REJECTED') AND "submittedById" IS NOT NULL AND "submittedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'POSTED' AND "submittedById" IS NOT NULL AND "submittedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'CANCELLED' AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0)
  );

ALTER TABLE "MaterialReconciliation"
  ADD CONSTRAINT "MaterialReconciliation_status_evidence_check" CHECK (
    ("status" = 'DRAFT' AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'POSTED' AND "postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
    OR ("status" = 'CANCELLED' AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0)
  );

-- Every operational ledger row must point to exactly one approved source fact.
ALTER TABLE "StockTransaction" DROP CONSTRAINT "StockTransaction_source_check";
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_source_check" CHECK (
  ("type" = 'OPENING' AND "goodsReceiptLineId" IS NULL AND "materialIssueLineId" IS NULL AND "stockTransferLineId" IS NULL AND "stockAdjustmentId" IS NULL AND "stockCountLineId" IS NULL AND "reconciliationId" IS NULL AND "reversalOfId" IS NULL)
  OR ("type" = 'RECEIPT' AND "goodsReceiptLineId" IS NOT NULL AND "materialIssueLineId" IS NULL AND "stockTransferLineId" IS NULL AND "stockAdjustmentId" IS NULL AND "stockCountLineId" IS NULL AND "reconciliationId" IS NULL AND "reversalOfId" IS NULL)
  OR ("type" = 'ISSUE' AND "goodsReceiptLineId" IS NULL AND "materialIssueLineId" IS NOT NULL AND "stockTransferLineId" IS NULL AND "stockAdjustmentId" IS NULL AND "stockCountLineId" IS NULL AND "reconciliationId" IS NULL AND "reversalOfId" IS NULL)
  OR ("type" IN ('TRANSFER_IN', 'TRANSFER_OUT') AND "goodsReceiptLineId" IS NULL AND "materialIssueLineId" IS NULL AND "stockTransferLineId" IS NOT NULL AND "stockAdjustmentId" IS NULL AND "stockCountLineId" IS NULL AND "reconciliationId" IS NULL AND "reversalOfId" IS NULL)
  OR ("type" IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') AND "goodsReceiptLineId" IS NULL AND "materialIssueLineId" IS NULL AND "stockTransferLineId" IS NULL AND (("stockAdjustmentId" IS NOT NULL)::int + ("stockCountLineId" IS NOT NULL)::int) = 1 AND "reconciliationId" IS NULL AND "reversalOfId" IS NULL)
  OR ("type" = 'RETURN' AND "goodsReceiptLineId" IS NULL AND "materialIssueLineId" IS NULL AND "stockTransferLineId" IS NULL AND "stockAdjustmentId" IS NULL AND "stockCountLineId" IS NULL AND "reconciliationId" IS NOT NULL AND "reversalOfId" IS NULL)
  OR ("type" = 'REVERSAL' AND "goodsReceiptLineId" IS NULL AND "materialIssueLineId" IS NULL AND "stockTransferLineId" IS NULL AND "stockAdjustmentId" IS NULL AND "stockCountLineId" IS NULL AND "reconciliationId" IS NULL AND "reversalOfId" IS NOT NULL AND LENGTH(BTRIM("reason")) > 0)
);

CREATE UNIQUE INDEX "StockTransaction_issue_source_key"
ON "StockTransaction"("materialIssueLineId") WHERE "materialIssueLineId" IS NOT NULL;
CREATE UNIQUE INDEX "StockTransaction_transfer_source_type_key"
ON "StockTransaction"("stockTransferLineId", "type") WHERE "stockTransferLineId" IS NOT NULL;
CREATE UNIQUE INDEX "StockTransaction_reversal_source_key"
ON "StockTransaction"("reversalOfId") WHERE "reversalOfId" IS NOT NULL;

-- RETURN is an inbound ledger direction. Balances remain derived only from the
-- immutable transaction table.
DROP VIEW "InventoryStockBalance";
CREATE VIEW "InventoryStockBalance" AS
SELECT
  st."locationId",
  st."materialId",
  st."unitId",
  SUM(
    CASE
      WHEN st."type" IN ('OPENING', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN') THEN st."quantity"
      WHEN st."type" IN ('ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -st."quantity"
      WHEN st."type" = 'REVERSAL' THEN
        CASE
          WHEN original."type" IN ('OPENING', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN') THEN -st."quantity"
          ELSE st."quantity"
        END
      ELSE 0
    END
  )::DECIMAL(18,3) AS "quantityOnHand"
FROM "StockTransaction" st
LEFT JOIN "StockTransaction" original ON original."id" = st."reversalOfId"
GROUP BY st."locationId", st."materialId", st."unitId";

DROP TRIGGER "StockTransaction_receipt_source_guard" ON "StockTransaction";
DROP FUNCTION "kdipl_guard_stock_receipt_source"();

CREATE OR REPLACE FUNCTION "kdipl_guard_stock_transaction_insert"()
RETURNS trigger AS $$
DECLARE
  source_row RECORD;
  original_row RECORD;
  available_quantity DECIMAL(18,3);
  outbound BOOLEAN := FALSE;
BEGIN
  IF NEW."type" = 'RECEIPT' THEN
    SELECT gr."status", gr."locationId", line."materialId", line."unitId", line."acceptedQuantity"
    INTO source_row
    FROM "GoodsReceiptLine" line
    JOIN "GoodsReceipt" gr ON gr."id" = line."goodsReceiptId"
    WHERE line."id" = NEW."goodsReceiptLineId";
    IF NOT FOUND OR source_row."status" <> 'POSTED' OR source_row."locationId" <> NEW."locationId"
      OR source_row."materialId" <> NEW."materialId" OR source_row."unitId" <> NEW."unitId"
      OR source_row."acceptedQuantity" <> NEW."quantity" THEN
      RAISE EXCEPTION 'Receipt stock transaction does not match its posted GRN line';
    END IF;
  ELSIF NEW."type" = 'ISSUE' THEN
    SELECT issue."status", issue."sourceLocationId", line."materialId", line."unitId", line."quantity"
    INTO source_row
    FROM "MaterialIssueLine" line
    JOIN "MaterialIssue" issue ON issue."id" = line."materialIssueId"
    WHERE line."id" = NEW."materialIssueLineId";
    IF NOT FOUND OR source_row."status" NOT IN ('POSTED', 'ACKNOWLEDGED')
      OR source_row."sourceLocationId" <> NEW."locationId" OR source_row."materialId" <> NEW."materialId"
      OR source_row."unitId" <> NEW."unitId" OR source_row."quantity" <> NEW."quantity" THEN
      RAISE EXCEPTION 'Issue stock transaction does not match its posted issue line';
    END IF;
    outbound := TRUE;
  ELSIF NEW."type" IN ('TRANSFER_IN', 'TRANSFER_OUT') THEN
    SELECT transfer."status", transfer."sourceLocationId", transfer."destinationLocationId",
      line."materialId", line."unitId", line."quantity"
    INTO source_row
    FROM "StockTransferLine" line
    JOIN "StockTransfer" transfer ON transfer."id" = line."stockTransferId"
    WHERE line."id" = NEW."stockTransferLineId";
    IF NOT FOUND OR source_row."materialId" <> NEW."materialId" OR source_row."unitId" <> NEW."unitId"
      OR source_row."quantity" <> NEW."quantity"
      OR (NEW."type" = 'TRANSFER_OUT' AND (source_row."status" NOT IN ('DISPATCHED', 'RECEIVED') OR source_row."sourceLocationId" <> NEW."locationId"))
      OR (NEW."type" = 'TRANSFER_IN' AND (source_row."status" <> 'RECEIVED' OR source_row."destinationLocationId" <> NEW."locationId")) THEN
      RAISE EXCEPTION 'Transfer stock transaction does not match its transfer line and state';
    END IF;
    outbound := NEW."type" = 'TRANSFER_OUT';
  ELSIF NEW."type" IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') THEN
    IF NEW."stockAdjustmentId" IS NOT NULL THEN
      SELECT adjustment."status", adjustment."locationId", adjustment."materialId", adjustment."unitId",
        adjustment."quantity", adjustment."direction"::text AS direction
      INTO source_row
      FROM "StockAdjustment" adjustment
      WHERE adjustment."id" = NEW."stockAdjustmentId";
      IF NOT FOUND OR source_row."status" <> 'POSTED' OR source_row."locationId" <> NEW."locationId"
        OR source_row."materialId" <> NEW."materialId" OR source_row."unitId" <> NEW."unitId"
        OR source_row."quantity" <> NEW."quantity"
        OR (NEW."type" = 'ADJUSTMENT_IN' AND source_row.direction <> 'IN')
        OR (NEW."type" = 'ADJUSTMENT_OUT' AND source_row.direction <> 'OUT') THEN
        RAISE EXCEPTION 'Adjustment stock transaction does not match its approved adjustment';
      END IF;
    ELSE
      SELECT count."status", count."locationId", line."materialId", line."unitId", line."varianceQuantity"
      INTO source_row
      FROM "StockCountLine" line
      JOIN "StockCount" count ON count."id" = line."stockCountId"
      WHERE line."id" = NEW."stockCountLineId";
      IF NOT FOUND OR source_row."status" <> 'POSTED' OR source_row."locationId" <> NEW."locationId"
        OR source_row."materialId" <> NEW."materialId" OR source_row."unitId" <> NEW."unitId"
        OR ABS(source_row."varianceQuantity") <> NEW."quantity"
        OR (NEW."type" = 'ADJUSTMENT_IN' AND source_row."varianceQuantity" <= 0)
        OR (NEW."type" = 'ADJUSTMENT_OUT' AND source_row."varianceQuantity" >= 0) THEN
        RAISE EXCEPTION 'Count stock transaction does not match its approved variance';
      END IF;
    END IF;
    outbound := NEW."type" = 'ADJUSTMENT_OUT';
  ELSIF NEW."type" = 'RETURN' THEN
    SELECT reconciliation."status", reconciliation."returnLocationId", reconciliation."returnedQuantity",
      line."materialId", line."unitId"
    INTO source_row
    FROM "MaterialReconciliation" reconciliation
    JOIN "MaterialIssueLine" line ON line."id" = reconciliation."materialIssueLineId"
    WHERE reconciliation."id" = NEW."reconciliationId";
    IF NOT FOUND OR source_row."status" <> 'POSTED' OR source_row."returnLocationId" <> NEW."locationId"
      OR source_row."materialId" <> NEW."materialId" OR source_row."unitId" <> NEW."unitId"
      OR source_row."returnedQuantity" <> NEW."quantity" THEN
      RAISE EXCEPTION 'Return stock transaction does not match its posted reconciliation';
    END IF;
  ELSIF NEW."type" = 'REVERSAL' THEN
    SELECT original.* INTO original_row
    FROM "StockTransaction" original
    WHERE original."id" = NEW."reversalOfId";
    IF NOT FOUND OR original_row."type" = 'REVERSAL' OR original_row."locationId" <> NEW."locationId"
      OR original_row."materialId" <> NEW."materialId" OR original_row."unitId" <> NEW."unitId"
      OR original_row."quantity" <> NEW."quantity" THEN
      RAISE EXCEPTION 'Reversal stock transaction does not match its original transaction';
    END IF;
    outbound := original_row."type" IN ('OPENING', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN');
  END IF;

  IF outbound THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW."locationId"::text || ':' || NEW."materialId"::text || ':' || NEW."unitId"::text,
      0
    ));
    SELECT COALESCE(balance."quantityOnHand", 0)
    INTO available_quantity
    FROM "InventoryStockBalance" balance
    WHERE balance."locationId" = NEW."locationId"
      AND balance."materialId" = NEW."materialId"
      AND balance."unitId" = NEW."unitId";
    IF COALESCE(available_quantity, 0) < NEW."quantity" THEN
      RAISE EXCEPTION 'Insufficient stock for outbound transaction';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransaction_receipt_source_guard"
BEFORE INSERT ON "StockTransaction"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_stock_transaction_insert"();

-- Only documented workflow transitions are legal. Non-draft workflow records
-- cannot be edited in place; stock corrections remain append-only reversals.
CREATE OR REPLACE FUNCTION "kdipl_guard_phase6_workflow"()
RETURNS trigger AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
  valid_transition BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status"::text <> 'DRAFT' THEN
      RAISE EXCEPTION 'Non-draft stock workflow records are immutable';
    END IF;
    RETURN OLD;
  END IF;

  old_status := OLD."status"::text;
  new_status := NEW."status"::text;
  IF old_status = new_status THEN
    IF old_status <> 'DRAFT' AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Non-draft stock workflow records are immutable';
    END IF;
    RETURN NEW;
  END IF;

  valid_transition := CASE TG_TABLE_NAME
    WHEN 'MaterialIssue' THEN
      (old_status = 'DRAFT' AND new_status IN ('POSTED', 'CANCELLED'))
      OR (old_status = 'POSTED' AND new_status = 'ACKNOWLEDGED')
    WHEN 'StockTransfer' THEN
      (old_status = 'DRAFT' AND new_status IN ('DISPATCHED', 'CANCELLED'))
      OR (old_status = 'DISPATCHED' AND new_status = 'RECEIVED')
    WHEN 'StockAdjustment' THEN
      (old_status = 'DRAFT' AND new_status IN ('SUBMITTED', 'CANCELLED'))
      OR (old_status = 'SUBMITTED' AND new_status IN ('APPROVED', 'REJECTED'))
      OR (old_status = 'APPROVED' AND new_status IN ('POSTED', 'CANCELLED'))
    WHEN 'StockCount' THEN
      (old_status = 'DRAFT' AND new_status IN ('SUBMITTED', 'CANCELLED'))
      OR (old_status = 'SUBMITTED' AND new_status IN ('APPROVED', 'REJECTED'))
      OR (old_status = 'APPROVED' AND new_status IN ('POSTED', 'CANCELLED'))
    WHEN 'MaterialReconciliation' THEN
      old_status = 'DRAFT' AND new_status IN ('POSTED', 'CANCELLED')
    ELSE FALSE
  END;

  IF NOT valid_transition THEN
    RAISE EXCEPTION 'Invalid % status transition from % to %', TG_TABLE_NAME, old_status, new_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MaterialIssue_workflow_guard" BEFORE UPDATE OR DELETE ON "MaterialIssue"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_workflow"();
CREATE TRIGGER "StockTransfer_workflow_guard" BEFORE UPDATE OR DELETE ON "StockTransfer"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_workflow"();
CREATE TRIGGER "StockAdjustment_workflow_guard" BEFORE UPDATE OR DELETE ON "StockAdjustment"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_workflow"();
CREATE TRIGGER "StockCount_workflow_guard" BEFORE UPDATE OR DELETE ON "StockCount"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_workflow"();
CREATE TRIGGER "MaterialReconciliation_workflow_guard" BEFORE UPDATE OR DELETE ON "MaterialReconciliation"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_workflow"();

CREATE OR REPLACE FUNCTION "kdipl_guard_phase6_line_mutation"()
RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
  parent_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'MaterialIssueLine' THEN
    parent_id := COALESCE(
      (to_jsonb(NEW) ->> 'materialIssueId')::uuid,
      (to_jsonb(OLD) ->> 'materialIssueId')::uuid
    );
    SELECT "status"::text INTO parent_status FROM "MaterialIssue" WHERE "id" = parent_id;
  ELSIF TG_TABLE_NAME = 'StockTransferLine' THEN
    parent_id := COALESCE(
      (to_jsonb(NEW) ->> 'stockTransferId')::uuid,
      (to_jsonb(OLD) ->> 'stockTransferId')::uuid
    );
    SELECT "status"::text INTO parent_status FROM "StockTransfer" WHERE "id" = parent_id;
  ELSE
    parent_id := COALESCE(
      (to_jsonb(NEW) ->> 'stockCountId')::uuid,
      (to_jsonb(OLD) ->> 'stockCountId')::uuid
    );
    SELECT "status"::text INTO parent_status FROM "StockCount" WHERE "id" = parent_id;
  END IF;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Stock workflow lines may be changed only while their parent is draft';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MaterialIssueLine_draft_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MaterialIssueLine"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_line_mutation"();
CREATE TRIGGER "StockTransferLine_draft_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StockTransferLine"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_line_mutation"();
CREATE TRIGGER "StockCountLine_draft_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StockCountLine"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_phase6_line_mutation"();

CREATE OR REPLACE FUNCTION "kdipl_guard_reconciliation_post"()
RETURNS trigger AS $$
DECLARE
  issued_quantity DECIMAL(18,3);
  issue_status TEXT;
  previously_reconciled DECIMAL(18,3);
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" <> 'POSTED' THEN
    SELECT line."quantity", issue."status"::text
    INTO issued_quantity, issue_status
    FROM "MaterialIssueLine" line
    JOIN "MaterialIssue" issue ON issue."id" = line."materialIssueId"
    WHERE line."id" = NEW."materialIssueLineId"
    FOR UPDATE OF line;
    IF NOT FOUND OR issue_status <> 'ACKNOWLEDGED' THEN
      RAISE EXCEPTION 'Only acknowledged issued material can be reconciled';
    END IF;
    SELECT COALESCE(SUM(
      reconciliation."consumedQuantity" + reconciliation."returnedQuantity"
      + reconciliation."wastageQuantity" + reconciliation."scrapQuantity"
    ), 0)
    INTO previously_reconciled
    FROM "MaterialReconciliation" reconciliation
    WHERE reconciliation."materialIssueLineId" = NEW."materialIssueLineId"
      AND reconciliation."status" = 'POSTED'
      AND reconciliation."id" <> NEW."id";
    IF previously_reconciled + NEW."consumedQuantity" + NEW."returnedQuantity"
      + NEW."wastageQuantity" + NEW."scrapQuantity" > issued_quantity THEN
      RAISE EXCEPTION 'Issued-material reconciliation exceeds issued quantity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MaterialReconciliation_post_guard"
BEFORE UPDATE OF "status" ON "MaterialReconciliation"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_reconciliation_post"();
