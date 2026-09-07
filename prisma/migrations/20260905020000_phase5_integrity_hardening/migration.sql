-- Phase 5 closes with database-enforced append-only stock and terminal GRN
-- records. Application authorization remains authoritative for who may invoke
-- commands; these triggers protect the accounting facts from accidental or
-- out-of-band mutation.

CREATE OR REPLACE FUNCTION "kdipl_reject_stock_transaction_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Stock transactions are immutable; append a reversal instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransaction_immutable_guard"
BEFORE UPDATE OR DELETE ON "StockTransaction"
FOR EACH ROW EXECUTE FUNCTION "kdipl_reject_stock_transaction_mutation"();

CREATE OR REPLACE FUNCTION "kdipl_guard_grn_header_mutation"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Posted or cancelled GRNs are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('POSTED', 'CANCELLED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Posted or cancelled GRNs are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GoodsReceipt_immutable_guard"
BEFORE UPDATE OR DELETE ON "GoodsReceipt"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_grn_header_mutation"();

CREATE OR REPLACE FUNCTION "kdipl_guard_grn_line_mutation"()
RETURNS trigger AS $$
DECLARE
  receipt_status "GoodsReceiptStatus";
  old_receipt_status "GoodsReceiptStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "status" INTO receipt_status
    FROM "GoodsReceipt"
    WHERE "id" = OLD."goodsReceiptId";
    IF receipt_status IS DISTINCT FROM 'DRAFT'::"GoodsReceiptStatus" THEN
      RAISE EXCEPTION 'GRN lines may be changed only while the GRN is draft';
    END IF;
    RETURN OLD;
  END IF;

  SELECT "status" INTO receipt_status
  FROM "GoodsReceipt"
  WHERE "id" = NEW."goodsReceiptId";

  IF TG_OP = 'UPDATE' THEN
    SELECT "status" INTO old_receipt_status
    FROM "GoodsReceipt"
    WHERE "id" = OLD."goodsReceiptId";
  END IF;

  IF receipt_status IS DISTINCT FROM 'DRAFT'::"GoodsReceiptStatus"
    OR (TG_OP = 'UPDATE' AND old_receipt_status IS DISTINCT FROM 'DRAFT'::"GoodsReceiptStatus") THEN
    RAISE EXCEPTION 'GRN lines may be changed only while the GRN is draft';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GoodsReceiptLine_draft_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "GoodsReceiptLine"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_grn_line_mutation"();

CREATE OR REPLACE FUNCTION "kdipl_guard_stock_receipt_source"()
RETURNS trigger AS $$
DECLARE
  source_row RECORD;
BEGIN
  IF NEW."type" = 'RECEIPT' THEN
    SELECT
      gr."status",
      gr."locationId",
      line."materialId",
      line."unitId",
      line."acceptedQuantity"
    INTO source_row
    FROM "GoodsReceiptLine" line
    JOIN "GoodsReceipt" gr ON gr."id" = line."goodsReceiptId"
    WHERE line."id" = NEW."goodsReceiptLineId";

    IF NOT FOUND OR source_row."status" <> 'POSTED'
      OR source_row."locationId" <> NEW."locationId"
      OR source_row."materialId" <> NEW."materialId"
      OR source_row."unitId" <> NEW."unitId"
      OR source_row."acceptedQuantity" <> NEW."quantity" THEN
      RAISE EXCEPTION 'Receipt stock transaction does not match its posted GRN line';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockTransaction_receipt_source_guard"
BEFORE INSERT ON "StockTransaction"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_stock_receipt_source"();

CREATE OR REPLACE FUNCTION "kdipl_guard_po_transition"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('ISSUED', 'CANCELLED')) OR
    (OLD."status" = 'ISSUED' AND NEW."status" IN ('ACCEPTED', 'CANCELLED')) OR
    (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')) OR
    (OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" = 'RECEIVED') OR
    (OLD."status" = 'RECEIVED' AND NEW."status" = 'CLOSED')
  ) THEN
    RAISE EXCEPTION 'Invalid purchase-order status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PurchaseOrder_transition_guard"
BEFORE UPDATE OF "status" ON "PurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION "kdipl_guard_po_transition"();

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
    IF EXISTS (
      SELECT 1
      FROM "GoodsReceiptException" exception
      JOIN "GoodsReceiptLine" line
        ON line."id" = exception."goodsReceiptLineId"
      JOIN "GoodsReceipt" receipt
        ON receipt."id" = line."goodsReceiptId"
      WHERE receipt."purchaseOrderId" = NEW."id"
        AND exception."status" IN ('OPEN', 'REPLACEMENT_EXPECTED', 'RETURN_PENDING')
    ) THEN
      RAISE EXCEPTION 'Purchase order cannot close with unresolved receipt exceptions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Revalidate accepted quantity while holding the PO row lock. This makes
-- posting concurrent draft GRNs serialize at the database boundary.
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

    IF po_status NOT IN ('ACCEPTED','PARTIALLY_RECEIVED') THEN
      RAISE EXCEPTION 'GRN can be posted only against an accepted or partially received purchase order';
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

    IF invalid_line_count > 0 THEN
      RAISE EXCEPTION 'GRN lines do not match the purchase order or exceed its accepted quantity';
    END IF;
    IF received_total <= 0 THEN
      RAISE EXCEPTION 'Posted GRN requires at least one received quantity';
    END IF;
    IF (
      SELECT COUNT(*) FROM "GoodsReceiptLine" WHERE "goodsReceiptId" = NEW."id"
    ) <> (
      SELECT COUNT(*) FROM "PurchaseOrderLine" WHERE "purchaseOrderId" = NEW."purchaseOrderId"
    ) THEN
      RAISE EXCEPTION 'Posted GRN must contain every purchase-order line';
    END IF;
  END IF;

  IF OLD."status" = 'POSTED' AND NEW."status" <> 'POSTED' THEN
    RAISE EXCEPTION 'Posted GRN cannot be changed to another status; use reversal workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
