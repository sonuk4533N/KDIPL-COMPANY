ALTER TYPE "GoodsReceiptStatus" ADD VALUE IF NOT EXISTS 'PHYSICALLY_VERIFIED';
ALTER TYPE "GoodsReceiptStatus" ADD VALUE IF NOT EXISTS 'PENDING_PM_APPROVAL';

ALTER TABLE "GoodsReceipt"
ADD COLUMN "verifiedById" UUID,
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" UUID,
ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "GoodsReceipt"
ADD CONSTRAINT "GoodsReceipt_verifiedById_fkey"
FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoodsReceipt"
ADD CONSTRAINT "GoodsReceipt_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "GoodsReceipt_verifiedById_verifiedAt_idx"
ON "GoodsReceipt"("verifiedById", "verifiedAt");

CREATE INDEX "GoodsReceipt_approvedById_approvedAt_idx"
ON "GoodsReceipt"("approvedById", "approvedAt");

ALTER TABLE "GoodsReceipt"
DROP CONSTRAINT "GoodsReceipt_state_check";

ALTER TABLE "GoodsReceipt"
ADD CONSTRAINT "GoodsReceipt_state_check" CHECK (
  ("status" = 'DRAFT' AND "verifiedById" IS NULL AND "verifiedAt" IS NULL AND "approvedById" IS NULL AND "approvedAt" IS NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
  ("status" IN ('PHYSICALLY_VERIFIED','PENDING_PM_APPROVAL') AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "approvedById" IS NULL AND "approvedAt" IS NULL AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
  ("status" = 'POSTED' AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL AND "postedById" IS NOT NULL AND "postedAt" IS NOT NULL AND "cancelledById" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
  ("status" = 'CANCELLED' AND "postedById" IS NULL AND "postedAt" IS NULL AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL AND LENGTH(BTRIM("cancellationReason")) > 0)
);

CREATE OR REPLACE FUNCTION "kdipl_guard_grn_header_mutation"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Verified, posted, or cancelled GRNs are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('POSTED', 'CANCELLED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Posted or cancelled GRNs are immutable';
  END IF;

  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('PHYSICALLY_VERIFIED','CANCELLED')) OR
    (OLD."status" = 'PHYSICALLY_VERIFIED' AND NEW."status" IN ('PENDING_PM_APPROVAL','DRAFT','CANCELLED')) OR
    (OLD."status" = 'PENDING_PM_APPROVAL' AND NEW."status" IN ('POSTED','DRAFT','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid GRN status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "kdipl_guard_grn_line_mutation"()
RETURNS trigger AS $$
DECLARE
  receipt_status "GoodsReceiptStatus";
  old_receipt_status "GoodsReceiptStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "status" INTO receipt_status FROM "GoodsReceipt" WHERE "id" = OLD."goodsReceiptId";
    IF receipt_status IS DISTINCT FROM 'DRAFT'::"GoodsReceiptStatus" THEN
      RAISE EXCEPTION 'GRN lines may be changed only while the GRN is draft';
    END IF;
    RETURN OLD;
  END IF;

  SELECT "status" INTO receipt_status FROM "GoodsReceipt" WHERE "id" = NEW."goodsReceiptId";
  IF TG_OP = 'UPDATE' THEN
    SELECT "status" INTO old_receipt_status FROM "GoodsReceipt" WHERE "id" = OLD."goodsReceiptId";
  END IF;

  IF receipt_status IS DISTINCT FROM 'DRAFT'::"GoodsReceiptStatus"
    OR (TG_OP = 'UPDATE' AND old_receipt_status IS DISTINCT FROM 'DRAFT'::"GoodsReceiptStatus") THEN
    RAISE EXCEPTION 'GRN lines may be changed only while the GRN is draft';
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
