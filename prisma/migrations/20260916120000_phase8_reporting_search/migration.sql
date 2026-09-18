ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VIEW';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DOWNLOAD';

CREATE TYPE "StockValuationMethod" AS ENUM ('MOVING_WEIGHTED_AVERAGE', 'FIFO', 'LAST_APPROVED_PURCHASE_RATE', 'QUANTITY_ONLY');
CREATE TYPE "ReportExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRY_QUEUED');

CREATE TABLE "StockValuationPolicy" (
  "id" UUID NOT NULL,
  "method" "StockValuationMethod" NOT NULL DEFAULT 'QUANTITY_ONLY',
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "caReference" VARCHAR(240),
  "settings" JSONB,
  "approvedById" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockValuationPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockValuationPolicy_period_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);
CREATE UNIQUE INDEX "StockValuationPolicy_effectiveFrom_key" ON "StockValuationPolicy"("effectiveFrom");
CREATE INDEX "StockValuationPolicy_method_effectiveFrom_effectiveTo_idx" ON "StockValuationPolicy"("method", "effectiveFrom", "effectiveTo");

CREATE TABLE "LowStockSetting" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "materialId" UUID NOT NULL,
  "minimumLevel" DECIMAL(18,3) NOT NULL,
  "reorderLevel" DECIMAL(18,3) NOT NULL,
  "createdById" UUID NOT NULL,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LowStockSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LowStockSetting_levels_check" CHECK ("minimumLevel" >= 0 AND "reorderLevel" >= "minimumLevel")
);
CREATE UNIQUE INDEX "LowStockSetting_projectId_locationId_materialId_key" ON "LowStockSetting"("projectId", "locationId", "materialId");
CREATE INDEX "LowStockSetting_projectId_materialId_idx" ON "LowStockSetting"("projectId", "materialId");
CREATE INDEX "LowStockSetting_locationId_materialId_idx" ON "LowStockSetting"("locationId", "materialId");

CREATE TABLE "InventoryLocationAccess" (
  "id" UUID NOT NULL, "employeeId" UUID NOT NULL, "locationId" UUID NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "InventoryLocationAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryLocationAccess_employeeId_locationId_key" ON "InventoryLocationAccess"("employeeId", "locationId");
CREATE INDEX "InventoryLocationAccess_employeeId_isActive_idx" ON "InventoryLocationAccess"("employeeId", "isActive");
CREATE INDEX "InventoryLocationAccess_locationId_isActive_idx" ON "InventoryLocationAccess"("locationId", "isActive");

CREATE TABLE "ProjectBudgetRevision" (
  "id" UUID NOT NULL, "projectId" UUID NOT NULL, "workPackage" VARCHAR(160),
  "revisionNumber" INTEGER NOT NULL, "approvedBudget" DECIMAL(18,2) NOT NULL,
  "reason" VARCHAR(1000) NOT NULL, "effectiveFrom" DATE NOT NULL, "approvedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ProjectBudgetRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectBudgetRevision_projectId_workPackage_revisionNumber_key" ON "ProjectBudgetRevision"("projectId", "workPackage", "revisionNumber");
CREATE INDEX "ProjectBudgetRevision_projectId_effectiveFrom_idx" ON "ProjectBudgetRevision"("projectId", "effectiveFrom");

CREATE TABLE "SavedReportFilter" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "name" VARCHAR(120) NOT NULL,
  "reportType" VARCHAR(80) NOT NULL, "filters" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedReportFilter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedReportFilter_userId_name_reportType_key" ON "SavedReportFilter"("userId", "name", "reportType");
CREATE INDEX "SavedReportFilter_userId_updatedAt_idx" ON "SavedReportFilter"("userId", "updatedAt");

CREATE TABLE "RecentSearch" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "query" VARCHAR(160) NOT NULL,
  "filters" JSONB, "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecentSearch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecentSearch_userId_searchedAt_idx" ON "RecentSearch"("userId", "searchedAt");

CREATE TABLE "ReportExportJob" (
  "id" UUID NOT NULL, "requestedById" UUID NOT NULL, "reportType" VARCHAR(80) NOT NULL,
  "format" VARCHAR(10) NOT NULL, "filters" JSONB NOT NULL, "financialYear" CHAR(5) NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL, "status" "ReportExportStatus" NOT NULL DEFAULT 'QUEUED',
  "rowCount" INTEGER, "fileRecordId" UUID, "error" TEXT, "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "downloadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportExportJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReportExportJob_idempotencyKey_key" ON "ReportExportJob"("idempotencyKey");
CREATE UNIQUE INDEX "ReportExportJob_fileRecordId_key" ON "ReportExportJob"("fileRecordId");
CREATE INDEX "ReportExportJob_requestedById_createdAt_idx" ON "ReportExportJob"("requestedById", "createdAt");
CREATE INDEX "ReportExportJob_status_createdAt_idx" ON "ReportExportJob"("status", "createdAt");
CREATE INDEX "ReportExportJob_expiresAt_idx" ON "ReportExportJob"("expiresAt");

CREATE TABLE "SupplierBlacklistEvent" (
  "id" UUID NOT NULL, "supplierId" UUID NOT NULL, "blacklisted" BOOLEAN NOT NULL,
  "reason" VARCHAR(1000) NOT NULL, "actorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierBlacklistEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierBlacklistEvent_supplierId_createdAt_idx" ON "SupplierBlacklistEvent"("supplierId", "createdAt");

-- Ledger-derived, rebuildable read model. Outbound quantities are signed at
-- read time and immutable reversal entries cancel their original posting.
CREATE VIEW "reporting_stock_balance" AS
SELECT st."locationId", st."materialId", st."unitId",
  SUM(CASE
    WHEN st.type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') THEN st.quantity
    WHEN st.type IN ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT') THEN -st.quantity
    WHEN st.type='REVERSAL' AND original.type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') THEN -st.quantity
    WHEN st.type='REVERSAL' THEN st.quantity
    ELSE 0 END)::DECIMAL(18,3) AS quantity
FROM "StockTransaction" st
LEFT JOIN "StockTransaction" original ON original.id=st."reversalOfId"
GROUP BY st."locationId", st."materialId", st."unitId";

CREATE INDEX IF NOT EXISTS "StockTransaction_createdAt_locationId_idx" ON "StockTransaction"("createdAt", "locationId");
CREATE INDEX IF NOT EXISTS "SupplierInvoice_finalizedAt_status_idx" ON "SupplierInvoice"("finalizedAt", "status");
CREATE INDEX IF NOT EXISTS "SupplierPayment_finalizedAt_status_idx" ON "SupplierPayment"("finalizedAt", "status");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_postedAt_status_idx" ON "GoodsReceipt"("postedAt", "status");
