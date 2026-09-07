ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'ISSUED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "PurchaseOrder"
ADD COLUMN "issuedById" UUID,
ADD COLUMN "issuedAt" TIMESTAMP(3),
ADD COLUMN "supplierAcceptedAt" TIMESTAMP(3),
ADD COLUMN "supplierAcceptanceReference" VARCHAR(100),
ADD COLUMN "acceptedRecordedById" UUID,
ADD COLUMN "closedById" UUID,
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" UUID,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancellationReason" VARCHAR(1000);

ALTER TABLE "GoodsReceipt"
ADD COLUMN "supplierDeliveryNoteDate" DATE,
ADD COLUMN "vehicleNumber" VARCHAR(50),
ADD COLUMN "transporter" VARCHAR(160);

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_issuedById_fkey"
FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_acceptedRecordedById_fkey"
FOREIGN KEY ("acceptedRecordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_closedById_fkey"
FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_cancelledById_fkey"
FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrder_issuedById_issuedAt_idx" ON "PurchaseOrder"("issuedById", "issuedAt");
CREATE INDEX "PurchaseOrder_acceptedRecordedById_supplierAcceptedAt_idx" ON "PurchaseOrder"("acceptedRecordedById", "supplierAcceptedAt");
CREATE INDEX "PurchaseOrder_status_expectedDeliveryDate_idx" ON "PurchaseOrder"("status", "expectedDeliveryDate");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_phase5_state_check" CHECK (
  ("status" = 'DRAFT' AND "issuedById" IS NULL AND "issuedAt" IS NULL AND "supplierAcceptedAt" IS NULL AND "acceptedRecordedById" IS NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'ISSUED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "supplierAcceptedAt" IS NULL AND "acceptedRecordedById" IS NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" IN ('ACCEPTED','PARTIALLY_RECEIVED','RECEIVED') AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "supplierAcceptedAt" IS NOT NULL AND "acceptedRecordedById" IS NOT NULL AND "closedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'CLOSED' AND "issuedById" IS NOT NULL AND "issuedAt" IS NOT NULL AND "supplierAcceptedAt" IS NOT NULL AND "acceptedRecordedById" IS NOT NULL AND "closedById" IS NOT NULL AND "closedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'CANCELLED' AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0 AND "closedAt" IS NULL)
);

-- Posted GRNs must be against supplier-accepted POs. Draft/issued/cancelled/closed
-- orders cannot create stock. The trigger also prevents post-state mutation.
CREATE OR REPLACE FUNCTION "kdipl_validate_grn_post"() RETURNS trigger AS $$
DECLARE
  po_status "PurchaseOrderStatus";
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" <> 'POSTED' THEN
    SELECT "status" INTO po_status FROM "PurchaseOrder" WHERE "id" = NEW."purchaseOrderId" FOR UPDATE;
    IF po_status NOT IN ('ACCEPTED','PARTIALLY_RECEIVED') THEN
      RAISE EXCEPTION 'GRN can be posted only against an accepted or partially received purchase order';
    END IF;
    IF NEW."receivedAt" IS NULL OR NEW."postedById" IS NULL OR NEW."postedAt" IS NULL THEN
      RAISE EXCEPTION 'Posted GRN requires receipt and posting evidence';
    END IF;
  END IF;
  IF OLD."status" = 'POSTED' AND NEW."status" <> 'POSTED' THEN
    RAISE EXCEPTION 'Posted GRN cannot be changed to another status; use reversal workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GoodsReceipt_post_guard"
BEFORE UPDATE ON "GoodsReceipt"
FOR EACH ROW EXECUTE FUNCTION "kdipl_validate_grn_post"();

-- Prevent cumulative accepted quantity from exceeding the PO line. Damaged and
-- rejected quantities do not enter usable stock and may be replaced later.
CREATE OR REPLACE FUNCTION "kdipl_validate_grn_line_post"() RETURNS trigger AS $$
DECLARE
  po_qty DECIMAL(18,3);
  accepted_before DECIMAL(18,3);
BEGIN
  SELECT pol."quantity" INTO po_qty
  FROM "PurchaseOrderLine" pol
  WHERE pol."id" = NEW."purchaseOrderLineId";

  SELECT COALESCE(SUM(grl."acceptedQuantity"), 0) INTO accepted_before
  FROM "GoodsReceiptLine" grl
  JOIN "GoodsReceipt" gr ON gr."id" = grl."goodsReceiptId"
  WHERE grl."purchaseOrderLineId" = NEW."purchaseOrderLineId"
    AND gr."status" = 'POSTED'
    AND grl."id" <> NEW."id";

  IF accepted_before + NEW."acceptedQuantity" > po_qty THEN
    RAISE EXCEPTION 'Accepted quantity exceeds purchase-order quantity';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GoodsReceiptLine_quantity_guard"
BEFORE INSERT OR UPDATE ON "GoodsReceiptLine"
FOR EACH ROW EXECUTE FUNCTION "kdipl_validate_grn_line_post"();
