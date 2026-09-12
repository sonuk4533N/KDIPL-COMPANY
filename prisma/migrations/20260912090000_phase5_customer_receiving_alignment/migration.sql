ALTER TYPE "InventoryLocationType" ADD VALUE IF NOT EXISTS 'TEMPORARY_STORE';
ALTER TYPE "InventoryLocationType" ADD VALUE IF NOT EXISTS 'TRANSIT';
ALTER TYPE "InventoryLocationType" ADD VALUE IF NOT EXISTS 'DAMAGED_REJECTED';

ALTER TABLE "InventoryLocation"
DROP CONSTRAINT "InventoryLocation_scope_check";

ALTER TABLE "InventoryLocation"
ADD CONSTRAINT "InventoryLocation_scope_check" CHECK (
  ("type" = 'CENTRAL_STORE' AND "projectId" IS NULL AND "siteId" IS NULL) OR
  ("type" = 'PROJECT_STORE' AND "projectId" IS NOT NULL AND "siteId" IS NULL) OR
  ("type" = 'SITE_STORE' AND "projectId" IS NOT NULL AND "siteId" IS NOT NULL) OR
  ("type" = 'TEMPORARY_STORE' AND "projectId" IS NOT NULL) OR
  ("type" = 'TRANSIT' AND "siteId" IS NULL) OR
  ("type" = 'DAMAGED_REJECTED')
);

ALTER TABLE "PurchaseOrder"
DROP CONSTRAINT "PurchaseOrder_phase5_state_check";

ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_phase5_state_check" CHECK (
  ("status" = 'DRAFT' AND "issuedById" IS NULL AND "issuedAt" IS NULL AND "supplierAcceptedAt" IS NULL AND "acceptedRecordedById" IS NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'ISSUED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'ACCEPTED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "supplierAcceptedAt" IS NOT NULL AND "acceptedRecordedById" IS NOT NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" IN ('PARTIALLY_RECEIVED','RECEIVED') AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'CLOSED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "closedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'CANCELLED' AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0 AND "closedAt" IS NULL)
);

CREATE OR REPLACE FUNCTION "kdipl_guard_po_transition"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('ISSUED', 'CANCELLED')) OR
    (OLD."status" = 'ISSUED' AND NEW."status" IN ('ACCEPTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) OR
    (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) OR
    (OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" = 'RECEIVED') OR
    (OLD."status" = 'RECEIVED' AND NEW."status" = 'CLOSED')
  ) THEN
    RAISE EXCEPTION 'Invalid purchase-order status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "kdipl_validate_grn_post"() RETURNS trigger AS $$
DECLARE
  po_status "PurchaseOrderStatus";
  invalid_line_count BIGINT;
  received_total DECIMAL(18,3);
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" <> 'POSTED' THEN
    SELECT "status" INTO po_status
    FROM "PurchaseOrder"
    WHERE "id" = NEW."purchaseOrderId"
    FOR UPDATE;

    IF po_status NOT IN ('ISSUED','ACCEPTED','PARTIALLY_RECEIVED') THEN
      RAISE EXCEPTION 'GRN can be posted only against an issued, accepted, or partially received purchase order';
    END IF;
    IF NEW."receivedAt" IS NULL OR NEW."postedById" IS NULL OR NEW."postedAt" IS NULL THEN
      RAISE EXCEPTION 'Posted GRN requires receipt and posting evidence';
    END IF;

    SELECT COUNT(*)
    INTO invalid_line_count
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
          JOIN "GoodsReceipt" previous_grn
            ON previous_grn."id" = previous_line."goodsReceiptId"
          WHERE previous_line."purchaseOrderLineId" = line."purchaseOrderLineId"
            AND previous_grn."status" = 'POSTED'
            AND previous_grn."id" <> NEW."id"
        ) + line."acceptedQuantity" > po_line."quantity"
      );

    SELECT COALESCE(SUM(line."receivedQuantity"), 0)
    INTO received_total
    FROM "GoodsReceiptLine" line
    WHERE line."goodsReceiptId" = NEW."id";

    IF invalid_line_count > 0 OR received_total <= 0 THEN
      RAISE EXCEPTION 'Posted GRN lines do not match the purchase order or exceed its accepted quantity';
    END IF;
  END IF;

  IF OLD."status" = 'POSTED' AND NEW."status" <> 'POSTED' THEN
    RAISE EXCEPTION 'Posted GRN cannot be changed to another status; use reversal workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
