CREATE TYPE "GoodsReceiptExceptionType" AS ENUM ('DAMAGED', 'REJECTED');
CREATE TYPE "GoodsReceiptExceptionStatus" AS ENUM (
  'OPEN',
  'REPLACEMENT_EXPECTED',
  'RETURN_PENDING',
  'RETURNED',
  'RESOLVED'
);

CREATE TABLE "GoodsReceiptException" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "goodsReceiptLineId" UUID NOT NULL,
  "type" "GoodsReceiptExceptionType" NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "status" "GoodsReceiptExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "reason" VARCHAR(1000),
  "evidenceReference" VARCHAR(500),
  "resolutionNotes" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceiptException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoodsReceiptException_positive_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "GoodsReceiptException_line_type_key"
ON "GoodsReceiptException"("goodsReceiptLineId", "type");
CREATE INDEX "GoodsReceiptException_status_createdAt_idx"
ON "GoodsReceiptException"("status", "createdAt");

ALTER TABLE "GoodsReceiptException" ADD CONSTRAINT "GoodsReceiptException_goodsReceiptLineId_fkey"
FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "kdipl_create_grn_exceptions"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" = 'DRAFT' THEN
    INSERT INTO "GoodsReceiptException" (
      "goodsReceiptLineId", "type", "quantity", "reason"
    )
    SELECT grl."id", 'DAMAGED'::"GoodsReceiptExceptionType", grl."damagedQuantity",
           COALESCE(NULLIF(BTRIM(grl."notes"), ''), 'Damaged material recorded at receipt')
    FROM "GoodsReceiptLine" grl
    WHERE grl."goodsReceiptId" = NEW."id" AND grl."damagedQuantity" > 0
    ON CONFLICT ("goodsReceiptLineId", "type") DO NOTHING;

    INSERT INTO "GoodsReceiptException" (
      "goodsReceiptLineId", "type", "quantity", "reason"
    )
    SELECT grl."id", 'REJECTED'::"GoodsReceiptExceptionType", grl."rejectedQuantity",
           COALESCE(NULLIF(BTRIM(grl."notes"), ''), 'Rejected material recorded at receipt')
    FROM "GoodsReceiptLine" grl
    WHERE grl."goodsReceiptId" = NEW."id" AND grl."rejectedQuantity" > 0
    ON CONFLICT ("goodsReceiptLineId", "type") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GoodsReceipt_exception_register"
AFTER UPDATE OF "status" ON "GoodsReceipt"
FOR EACH ROW EXECUTE FUNCTION "kdipl_create_grn_exceptions"();

CREATE OR REPLACE FUNCTION "kdipl_guard_po_close"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'CLOSED' AND OLD."status" <> 'CLOSED' THEN
    IF OLD."status" <> 'RECEIVED' THEN
      RAISE EXCEPTION 'Only a fully received purchase order can be closed';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "GoodsReceipt"
      WHERE "purchaseOrderId" = NEW."id" AND "status" = 'DRAFT'
    ) THEN
      RAISE EXCEPTION 'Purchase order cannot close while draft GRNs exist';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PurchaseOrder_close_guard"
BEFORE UPDATE OF "status" ON "PurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_po_close"();
