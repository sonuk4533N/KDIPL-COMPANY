CREATE TYPE "FileScanStatus" AS ENUM ('QUARANTINED','CLEAN','REJECTED','SCAN_FAILED');
CREATE TYPE "GoodsReceiptDocumentType" AS ENUM ('DELIVERY_CHALLAN','MATERIAL_PHOTO','SUPPLIER_INVOICE','RECEIVER_SIGNATURE');
CREATE TYPE "PurchaseOrderAmendmentStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "NegativeStockExceptionStatus" AS ENUM ('OPEN','RESOLVED');

ALTER TABLE "FileRecord"
  ADD COLUMN "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'QUARANTINED',
  ADD COLUMN "scanProvider" VARCHAR(80),
  ADD COLUMN "scanReference" VARCHAR(500),
  ADD COLUMN "scannedAt" TIMESTAMP(3),
  ADD COLUMN "retentionUntil" DATE;

UPDATE "FileRecord"
SET "scanStatus" = 'CLEAN',
    "scanProvider" = 'LEGACY_TRUSTED',
    "scannedAt" = "uploadedAt",
    "retentionUntil" = ("uploadedAt"::date + INTERVAL '8 years')::date;

ALTER TABLE "FileRecord" ALTER COLUMN "retentionUntil" SET NOT NULL;
CREATE INDEX "FileRecord_scanStatus_uploadedAt_idx" ON "FileRecord"("scanStatus","uploadedAt");
CREATE INDEX "FileRecord_retentionUntil_idx" ON "FileRecord"("retentionUntil");

ALTER TABLE "GoodsReceipt"
  ADD COLUMN "directSiteDelivery" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gpsLatitude" DECIMAL(9,6),
  ADD COLUMN "gpsLongitude" DECIMAL(9,6),
  ADD COLUMN "gpsCapturedAt" TIMESTAMP(3),
  ADD COLUMN "receiverName" VARCHAR(160),
  ADD COLUMN "siteAcknowledgedById" UUID,
  ADD COLUMN "siteAcknowledgedAt" TIMESTAMP(3);

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_siteAcknowledgedById_fkey"
  FOREIGN KEY ("siteAcknowledgedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GoodsReceipt_siteAcknowledgedById_siteAcknowledgedAt_idx"
  ON "GoodsReceipt"("siteAcknowledgedById","siteAcknowledgedAt");
ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_direct_site_coordinates_check" CHECK (
    NOT "directSiteDelivery" OR (
      "gpsLatitude" BETWEEN -90 AND 90
      AND "gpsLongitude" BETWEEN -180 AND 180
      AND "gpsCapturedAt" IS NOT NULL
      AND "receiverName" IS NOT NULL
      AND LENGTH(BTRIM("receiverName")) > 0
    )
  );

CREATE TABLE "GoodsReceiptDocument" (
  "id" UUID NOT NULL,
  "goodsReceiptId" UUID NOT NULL,
  "fileRecordId" UUID NOT NULL,
  "type" "GoodsReceiptDocumentType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceiptDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoodsReceiptDocument_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GoodsReceiptDocument_fileRecordId_fkey" FOREIGN KEY ("fileRecordId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoodsReceiptDocument_fileRecordId_key" ON "GoodsReceiptDocument"("fileRecordId");
CREATE INDEX "GoodsReceiptDocument_goodsReceiptId_type_idx" ON "GoodsReceiptDocument"("goodsReceiptId","type");

ALTER TABLE "PurchaseOrder" ADD COLUMN "shortCloseReason" VARCHAR(1000);

CREATE TABLE "PurchaseOrderAmendment" (
  "id" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PurchaseOrderAmendmentStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" VARCHAR(1000) NOT NULL,
  "proposedExpectedDeliveryDate" DATE NOT NULL,
  "proposedPaymentTerms" VARCHAR(500) NOT NULL,
  "proposedFreightAmount" DECIMAL(18,2) NOT NULL,
  "createdById" UUID NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "decidedById" UUID,
  "decidedAt" TIMESTAMP(3),
  "decisionReason" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrderAmendment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderAmendment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderAmendment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderAmendment_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderAmendment_state_check" CHECK (
    ("status" = 'DRAFT' AND "submittedAt" IS NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL) OR
    ("status" = 'PENDING_APPROVAL' AND "submittedAt" IS NOT NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL) OR
    ("status" IN ('APPROVED','REJECTED') AND "submittedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL) OR
    ("status" = 'CANCELLED' AND "decidedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "PurchaseOrderAmendment_purchaseOrderId_version_key" ON "PurchaseOrderAmendment"("purchaseOrderId","version");
CREATE INDEX "PurchaseOrderAmendment_purchaseOrderId_status_idx" ON "PurchaseOrderAmendment"("purchaseOrderId","status");
CREATE INDEX "PurchaseOrderAmendment_decidedById_decidedAt_idx" ON "PurchaseOrderAmendment"("decidedById","decidedAt");

CREATE TABLE "PurchaseOrderAmendmentLine" (
  "id" UUID NOT NULL,
  "amendmentId" UUID NOT NULL,
  "purchaseOrderLineId" UUID NOT NULL,
  "proposedQuantity" DECIMAL(18,3) NOT NULL,
  "proposedUnitPrice" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderAmendmentLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderAmendmentLine_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "PurchaseOrderAmendment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderAmendmentLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderAmendmentLine_quantity_price_check" CHECK ("proposedQuantity" > 0 AND "proposedUnitPrice" >= 0)
);
CREATE UNIQUE INDEX "PurchaseOrderAmendmentLine_amendmentId_purchaseOrderLineId_key" ON "PurchaseOrderAmendmentLine"("amendmentId","purchaseOrderLineId");
CREATE INDEX "PurchaseOrderAmendmentLine_purchaseOrderLineId_idx" ON "PurchaseOrderAmendmentLine"("purchaseOrderLineId");

CREATE TABLE "TemporaryNegativeStockException" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "locationId" UUID NOT NULL,
  "materialId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "sourceTransactionId" UUID NOT NULL,
  "deficitQuantity" DECIMAL(18,3) NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "createdById" UUID NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolutionDueAt" TIMESTAMP(3) NOT NULL,
  "status" "NegativeStockExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "resolutionTransactionId" UUID,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "TemporaryNegativeStockException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TemporaryNegativeStockException_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemporaryNegativeStockException_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemporaryNegativeStockException_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemporaryNegativeStockException_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "StockTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemporaryNegativeStockException_resolutionTransactionId_fkey" FOREIGN KEY ("resolutionTransactionId") REFERENCES "StockTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemporaryNegativeStockException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TemporaryNegativeStockException_state_check" CHECK (
    ("status" = 'OPEN' AND "resolvedAt" IS NULL AND "resolutionTransactionId" IS NULL) OR
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "resolutionTransactionId" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "TemporaryNegativeStockException_sourceTransactionId_key" ON "TemporaryNegativeStockException"("sourceTransactionId");
CREATE INDEX "TemporaryNegativeStockException_status_resolutionDueAt_idx" ON "TemporaryNegativeStockException"("status","resolutionDueAt");
CREATE INDEX "TemporaryNegativeStockException_locationId_materialId_status_idx" ON "TemporaryNegativeStockException"("locationId","materialId","status");

ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_phase5_state_check";
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_phase5_state_check" CHECK (
  ("status" = 'DRAFT' AND "issuedById" IS NULL AND "issuedAt" IS NULL AND "supplierAcceptedAt" IS NULL AND "acceptedRecordedById" IS NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL AND "shortCloseReason" IS NULL) OR
  ("status" = 'ISSUED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL AND "shortCloseReason" IS NULL) OR
  ("status" = 'ACCEPTED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "supplierAcceptedAt" IS NOT NULL AND "acceptedRecordedById" IS NOT NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL AND "shortCloseReason" IS NULL) OR
  ("status" IN ('PARTIALLY_RECEIVED','RECEIVED') AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL AND "shortCloseReason" IS NULL) OR
  ("status" = 'CLOSED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "closedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'CANCELLED' AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0 AND "closedAt" IS NULL AND "shortCloseReason" IS NULL)
);

CREATE OR REPLACE FUNCTION "kdipl_guard_po_transition"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('ISSUED', 'CANCELLED')) OR
    (OLD."status" = 'ISSUED' AND NEW."status" IN ('ACCEPTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) OR
    (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) OR
    (OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" IN ('RECEIVED','CLOSED')) OR
    (OLD."status" = 'RECEIVED' AND NEW."status" = 'CLOSED')
  ) THEN
    RAISE EXCEPTION 'Invalid purchase-order status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "kdipl_guard_po_close"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'CLOSED' AND OLD."status" <> 'CLOSED' THEN
    IF OLD."status" NOT IN ('RECEIVED','PARTIALLY_RECEIVED') THEN
      RAISE EXCEPTION 'Only a received or partially received purchase order can be closed';
    END IF;
    IF OLD."status" = 'PARTIALLY_RECEIVED' AND (NEW."shortCloseReason" IS NULL OR LENGTH(BTRIM(NEW."shortCloseReason")) < 3) THEN
      RAISE EXCEPTION 'Short-closing a partially received purchase order requires a reason';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "GoodsReceipt"
      WHERE "purchaseOrderId" = NEW."id"
        AND "status" IN ('DRAFT','PHYSICALLY_VERIFIED','PENDING_PM_APPROVAL')
    ) THEN
      RAISE EXCEPTION 'Purchase order cannot close while unposted GRNs exist';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM "GoodsReceiptException" exception
      JOIN "GoodsReceiptLine" line ON line."id" = exception."goodsReceiptLineId"
      JOIN "GoodsReceipt" receipt ON receipt."id" = line."goodsReceiptId"
      WHERE receipt."purchaseOrderId" = NEW."id"
        AND exception."status" IN ('OPEN','REPLACEMENT_EXPECTED','RETURN_PENDING')
    ) THEN
      RAISE EXCEPTION 'Purchase order cannot close with unresolved receipt exceptions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "kdipl_validate_grn_post"() RETURNS trigger AS $$
DECLARE
  po_status "PurchaseOrderStatus";
  invalid_line_count BIGINT;
  received_total DECIMAL(18,3);
  receiving_location_type "InventoryLocationType";
  clean_evidence_count BIGINT;
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" <> 'POSTED' THEN
    SELECT "status" INTO po_status
    FROM "PurchaseOrder"
    WHERE "id" = NEW."purchaseOrderId"
    FOR UPDATE;

    IF OLD."status" <> 'PENDING_PM_APPROVAL' THEN
      RAISE EXCEPTION 'GRN requires Store Keeper verification and PM approval before posting';
    END IF;
    IF po_status NOT IN ('ISSUED','ACCEPTED','PARTIALLY_RECEIVED') THEN
      RAISE EXCEPTION 'GRN can be posted only against an issued, accepted, or partially received purchase order';
    END IF;
    IF NEW."receivedAt" IS NULL OR NEW."verifiedById" IS NULL OR NEW."verifiedAt" IS NULL
      OR NEW."approvedById" IS NULL OR NEW."approvedAt" IS NULL
      OR NEW."postedById" IS NULL OR NEW."postedAt" IS NULL THEN
      RAISE EXCEPTION 'Posted GRN requires verification, approval, receipt, and posting evidence';
    END IF;

    IF NEW."directSiteDelivery" THEN
      SELECT "type" INTO receiving_location_type
      FROM "InventoryLocation"
      WHERE "id" = NEW."locationId";

      IF receiving_location_type IS DISTINCT FROM 'SITE_STORE'::"InventoryLocationType"
        OR NEW."gpsLatitude" IS NULL OR NEW."gpsLatitude" < -90 OR NEW."gpsLatitude" > 90
        OR NEW."gpsLongitude" IS NULL OR NEW."gpsLongitude" < -180 OR NEW."gpsLongitude" > 180
        OR NEW."gpsCapturedAt" IS NULL
        OR NEW."receiverName" IS NULL OR LENGTH(BTRIM(NEW."receiverName")) = 0
        OR NEW."siteAcknowledgedById" IS NULL OR NEW."siteAcknowledgedAt" IS NULL THEN
        RAISE EXCEPTION 'Direct-site GRN requires valid GPS, receiver, site location, and Site Supervisor acknowledgment';
      END IF;

      SELECT COUNT(DISTINCT document."type") INTO clean_evidence_count
      FROM "GoodsReceiptDocument" document
      JOIN "FileRecord" file ON file."id" = document."fileRecordId"
      WHERE document."goodsReceiptId" = NEW."id"
        AND file."scanStatus" = 'CLEAN'
        AND document."type" IN ('DELIVERY_CHALLAN','MATERIAL_PHOTO','SUPPLIER_INVOICE','RECEIVER_SIGNATURE');

      IF clean_evidence_count <> 4 THEN
        RAISE EXCEPTION 'Direct-site GRN requires clean challan, material photo, supplier invoice, and receiver signature evidence';
      END IF;
    END IF;

    SELECT COUNT(*) INTO invalid_line_count
    FROM "GoodsReceiptLine" line
    LEFT JOIN "PurchaseOrderLine" po_line
      ON po_line."id" = line."purchaseOrderLineId"
      AND po_line."purchaseOrderId" = NEW."purchaseOrderId"
    LEFT JOIN "MaterialRequirementLine" requirement_line
      ON requirement_line."id" = po_line."requirementLineId"
    WHERE line."goodsReceiptId" = NEW."id"
      AND (
        po_line."id" IS NULL
        OR requirement_line."id" IS NULL
        OR line."materialId" <> requirement_line."materialId"
        OR line."unitId" <> po_line."unitId"
        OR line."orderedQuantity" <> po_line."quantity"
        OR (
          SELECT COALESCE(SUM(previous_line."acceptedQuantity"), 0)
          FROM "GoodsReceiptLine" previous_line
          JOIN "GoodsReceipt" previous_grn ON previous_grn."id" = previous_line."goodsReceiptId"
          WHERE previous_line."purchaseOrderLineId" = line."purchaseOrderLineId"
            AND previous_grn."status" = 'POSTED'
            AND previous_grn."id" <> NEW."id"
        ) + line."acceptedQuantity" > po_line."quantity"
        AND NULLIF(BTRIM(NEW."excessApprovalReason"), '') IS NULL
      );

    SELECT COALESCE(SUM(line."receivedQuantity"), 0)
    INTO received_total
    FROM "GoodsReceiptLine" line
    WHERE line."goodsReceiptId" = NEW."id";

    IF invalid_line_count > 0 OR received_total <= 0 THEN
      RAISE EXCEPTION 'Posted GRN lines do not match the PO or excess approval reason is missing';
    END IF;
  END IF;

  IF OLD."status" = 'POSTED' AND NEW."status" <> 'POSTED' THEN
    RAISE EXCEPTION 'Posted GRN cannot be changed to another status; use reversal workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "kdipl_add_working_days"(start_at TIMESTAMP, days_to_add INTEGER)
RETURNS TIMESTAMP AS $$
DECLARE
  result TIMESTAMP := start_at;
  added INTEGER := 0;
BEGIN
  WHILE added < days_to_add LOOP
    result := result + INTERVAL '1 day';
    IF EXTRACT(ISODOW FROM result) < 6 THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION "kdipl_guard_negative_stock"() RETURNS trigger AS $$
DECLARE
  resulting_balance DECIMAL(18,3);
  is_store_keeper BOOLEAN;
BEGIN
  SELECT COALESCE(SUM("quantity"),0) + NEW."quantity"
  INTO resulting_balance
  FROM "StockTransaction"
  WHERE "locationId" = NEW."locationId"
    AND "materialId" = NEW."materialId"
    AND "unitId" = NEW."unitId";

  IF resulting_balance < 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM "UserRole" user_role
      JOIN "Role" role ON role."id" = user_role."roleId"
      WHERE user_role."userId" = NEW."createdById"
        AND role."code" = 'STORE_KEEPER'
        AND role."isActive" = true
    ) INTO is_store_keeper;
    IF NOT is_store_keeper THEN
      RAISE EXCEPTION 'Only a Store Keeper may create temporary negative stock';
    END IF;
    IF NEW."reason" IS NULL OR LENGTH(BTRIM(NEW."reason")) < 3 THEN
      RAISE EXCEPTION 'Temporary negative stock requires a reason';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransaction_negative_guard"
BEFORE INSERT ON "StockTransaction"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_negative_stock"();

CREATE OR REPLACE FUNCTION "kdipl_track_negative_stock"() RETURNS trigger AS $$
DECLARE
  resulting_balance DECIMAL(18,3);
BEGIN
  SELECT COALESCE(SUM("quantity"),0)
  INTO resulting_balance
  FROM "StockTransaction"
  WHERE "locationId" = NEW."locationId"
    AND "materialId" = NEW."materialId"
    AND "unitId" = NEW."unitId";

  IF resulting_balance < 0 THEN
    INSERT INTO "TemporaryNegativeStockException" (
      "locationId","materialId","unitId","sourceTransactionId","deficitQuantity",
      "reason","createdById","detectedAt","resolutionDueAt","status"
    ) VALUES (
      NEW."locationId",NEW."materialId",NEW."unitId",NEW."id",ABS(resulting_balance),
      NEW."reason",NEW."createdById",NEW."createdAt",
      "kdipl_add_working_days"(NEW."createdAt",3),'OPEN'
    );
  ELSE
    UPDATE "TemporaryNegativeStockException"
    SET "status" = 'RESOLVED',
        "resolutionTransactionId" = NEW."id",
        "resolvedAt" = NEW."createdAt"
    WHERE "locationId" = NEW."locationId"
      AND "materialId" = NEW."materialId"
      AND "unitId" = NEW."unitId"
      AND "status" = 'OPEN';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransaction_negative_tracker"
AFTER INSERT ON "StockTransaction"
FOR EACH ROW EXECUTE FUNCTION "kdipl_track_negative_stock"();

CREATE OR REPLACE FUNCTION "kdipl_guard_file_record"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'File records are retained; archive instead of deleting';
  END IF;
  IF NEW."filename" IS DISTINCT FROM OLD."filename"
    OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
    OR NEW."size" IS DISTINCT FROM OLD."size"
    OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
    OR NEW."storageProvider" IS DISTINCT FROM OLD."storageProvider"
    OR NEW."documentType" IS DISTINCT FROM OLD."documentType"
    OR NEW."uploadedById" IS DISTINCT FROM OLD."uploadedById"
    OR NEW."uploadedAt" IS DISTINCT FROM OLD."uploadedAt"
    OR NEW."retentionUntil" < OLD."retentionUntil" THEN
    RAISE EXCEPTION 'Stored file identity and retention are immutable';
  END IF;
  IF OLD."scanStatus" IN ('CLEAN','REJECTED') AND NEW."scanStatus" IS DISTINCT FROM OLD."scanStatus" THEN
    RAISE EXCEPTION 'Final file scan result is immutable';
  END IF;
  IF OLD."scanStatus" = 'QUARANTINED' AND NEW."scanStatus" NOT IN ('QUARANTINED','CLEAN','REJECTED','SCAN_FAILED') THEN
    RAISE EXCEPTION 'Invalid file scan transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FileRecord_retention_guard"
BEFORE UPDATE OR DELETE ON "FileRecord"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_file_record"();

CREATE OR REPLACE FUNCTION "kdipl_guard_amendment_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Purchase-order amendment history cannot be deleted';
  END IF;
  IF OLD."status" IN ('APPROVED','REJECTED','CANCELLED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Finalized purchase-order amendments are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PurchaseOrderAmendment_immutable_guard"
BEFORE UPDATE OR DELETE ON "PurchaseOrderAmendment"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_amendment_mutation"();
