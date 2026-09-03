CREATE TYPE "InventoryLocationType" AS ENUM ('CENTRAL_STORE', 'PROJECT_STORE', 'SITE_STORE');
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
CREATE TYPE "StockTransactionType" AS ENUM ('OPENING', 'RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL');

CREATE TABLE "InventoryLocation" (
    "id" UUID NOT NULL,
    "locationCode" VARCHAR(50) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "InventoryLocationType" NOT NULL,
    "projectId" UUID,
    "siteId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryLocation_scope_check" CHECK (
      ("type" = 'CENTRAL_STORE' AND "projectId" IS NULL AND "siteId" IS NULL) OR
      ("type" = 'PROJECT_STORE' AND "projectId" IS NOT NULL AND "siteId" IS NULL) OR
      ("type" = 'SITE_STORE' AND "projectId" IS NOT NULL AND "siteId" IS NOT NULL)
    )
);

CREATE TABLE "GoodsReceipt" (
    "id" UUID NOT NULL,
    "grnNumber" VARCHAR(30) NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierDeliveryNote" VARCHAR(100),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GoodsReceipt_state_check" CHECK (
      ("status" = 'DRAFT' AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
      ("status" = 'POSTED' AND "postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
      ("status" = 'CANCELLED' AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0)
    )
);

CREATE TABLE "GoodsReceiptLine" (
    "id" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "orderedQuantity" DECIMAL(18,3) NOT NULL,
    "receivedQuantity" DECIMAL(18,3) NOT NULL,
    "acceptedQuantity" DECIMAL(18,3) NOT NULL,
    "damagedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GoodsReceiptLine_quantity_check" CHECK (
      "orderedQuantity" > 0 AND
      "receivedQuantity" >= 0 AND
      "acceptedQuantity" >= 0 AND
      "damagedQuantity" >= 0 AND
      "rejectedQuantity" >= 0 AND
      "receivedQuantity" = "acceptedQuantity" + "damagedQuantity" + "rejectedQuantity"
    )
);

CREATE TABLE "StockTransaction" (
    "id" UUID NOT NULL,
    "transactionNumber" VARCHAR(30) NOT NULL,
    "type" "StockTransactionType" NOT NULL,
    "locationId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "goodsReceiptLineId" UUID,
    "reversalOfId" UUID,
    "reason" VARCHAR(1000),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockTransaction_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "StockTransaction_source_check" CHECK (
      ("type" = 'RECEIPT' AND "goodsReceiptLineId" IS NOT NULL AND "reversalOfId" IS NULL) OR
      ("type" = 'REVERSAL' AND "goodsReceiptLineId" IS NULL AND "reversalOfId" IS NOT NULL AND LENGTH(BTRIM("reason")) > 0) OR
      ("type" NOT IN ('RECEIPT', 'REVERSAL') AND "goodsReceiptLineId" IS NULL AND "reversalOfId" IS NULL)
    )
);

CREATE UNIQUE INDEX "InventoryLocation_locationCode_key" ON "InventoryLocation"("locationCode");
CREATE UNIQUE INDEX "GoodsReceipt_grnNumber_key" ON "GoodsReceipt"("grnNumber");
CREATE UNIQUE INDEX "GoodsReceiptLine_goodsReceiptId_purchaseOrderLineId_key" ON "GoodsReceiptLine"("goodsReceiptId", "purchaseOrderLineId");
CREATE UNIQUE INDEX "StockTransaction_transactionNumber_key" ON "StockTransaction"("transactionNumber");
CREATE UNIQUE INDEX "StockTransaction_goodsReceiptLineId_key" ON "StockTransaction"("goodsReceiptLineId") WHERE "goodsReceiptLineId" IS NOT NULL;
CREATE INDEX "InventoryLocation_projectId_isActive_idx" ON "InventoryLocation"("projectId", "isActive");
CREATE INDEX "InventoryLocation_siteId_isActive_idx" ON "InventoryLocation"("siteId", "isActive");
CREATE INDEX "GoodsReceipt_purchaseOrderId_status_idx" ON "GoodsReceipt"("purchaseOrderId", "status");
CREATE INDEX "GoodsReceipt_locationId_status_idx" ON "GoodsReceipt"("locationId", "status");
CREATE INDEX "GoodsReceiptLine_goodsReceiptId_idx" ON "GoodsReceiptLine"("goodsReceiptId");
CREATE INDEX "GoodsReceiptLine_materialId_idx" ON "GoodsReceiptLine"("materialId");
CREATE INDEX "StockTransaction_locationId_materialId_createdAt_idx" ON "StockTransaction"("locationId", "materialId", "createdAt");
CREATE INDEX "StockTransaction_materialId_createdAt_idx" ON "StockTransaction"("materialId", "createdAt");

ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 5 authorization uses permission codes that already exist in the application catalog.
INSERT INTO "RolePermission" ("roleId", "permissionId", "grantedAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('inventory.view', 'inventory.receive')
WHERE r."code" = 'STORE_KEEPER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Stock is derived from this immutable ledger. Do not create a mutable stock-balance source of truth.
CREATE VIEW "InventoryStockBalance" AS
SELECT
  st."locationId",
  st."materialId",
  st."unitId",
  SUM(
    CASE
      WHEN st."type" IN ('OPENING', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN st."quantity"
      WHEN st."type" IN ('ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -st."quantity"
      WHEN st."type" = 'REVERSAL' THEN
        CASE
          WHEN original."type" IN ('OPENING', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN -st."quantity"
          ELSE st."quantity"
        END
      ELSE 0
    END
  )::DECIMAL(18,3) AS "quantityOnHand"
FROM "StockTransaction" st
LEFT JOIN "StockTransaction" original ON original."id" = st."reversalOfId"
GROUP BY st."locationId", st."materialId", st."unitId";

-- Posting a GRN is intentionally NOT enabled in this migration because the current
-- PurchaseOrder state machine contains only DRAFT. Phase 5 must not treat an
-- unissued PO as authorization to increase stock. The application command that
-- posts a GRN must remain blocked until KDIPL confirms the PO issue/acceptance rule.