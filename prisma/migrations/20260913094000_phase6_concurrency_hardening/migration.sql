CREATE FUNCTION "kdipl_customer_movement_hardening"() RETURNS TRIGGER AS $$
DECLARE source "InventoryLocation"; destination "InventoryLocation"; parent "CustomerStockMovement";
  book DECIMAL(18,3); reserved DECIMAL(18,3);
BEGIN
  PERFORM pg_advisory_xact_lock(6062026::bigint);
  SELECT * INTO source FROM "InventoryLocation" WHERE id=NEW."sourceLocationId";
  SELECT * INTO destination FROM "InventoryLocation" WHERE id=NEW."destinationLocationId";
  IF TG_OP='INSERT' THEN
    IF EXISTS (SELECT 1 FROM "Project" WHERE id IN (source."projectId",destination."projectId") AND status IN ('COMPLETED','CANCELLED')) THEN RAISE EXCEPTION 'Closed project cannot accept movement requests'; END IF;
    IF NEW.kind='ISSUE' AND EXISTS (SELECT 1 FROM "ProjectStockClosure" WHERE "projectId" IN (source."projectId",destination."projectId")) THEN RAISE EXCEPTION 'New issues are blocked during project closure'; END IF;
    IF NEW.kind IN ('ISSUE','RETURN') OR (NEW.kind='NON_USABLE' AND source."siteId" IS NOT NULL AND NEW.category IN ('DAMAGE','THEFT_LOSS')) THEN
      IF NEW."gpsCapturedAt" IS NULL OR NEW."gpsCapturedAt" NOT BETWEEN CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND CURRENT_TIMESTAMP+INTERVAL '15 minutes' THEN RAISE EXCEPTION 'Fresh GPS capture is mandatory'; END IF;
    END IF;
    IF NEW.kind='COUNT' THEN
      SELECT COALESCE((SELECT "quantityOnHand" FROM "InventoryStockBalance" WHERE "locationId"=source.id AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId"),0) INTO book;
      IF NEW."bookQuantity" IS DISTINCT FROM book THEN RAISE EXCEPTION 'Count snapshot must equal current ledger stock'; END IF;
      IF EXISTS (SELECT 1 FROM "CustomerStockMovement" WHERE kind='TRANSFER' AND status='DISPATCHED' AND "sourceLocationId"=source.id AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId") THEN RAISE EXCEPTION 'Resolve in-transit transfers before counting'; END IF;
    END IF;
    IF NEW."varianceOfId" IS NOT NULL THEN
      SELECT * INTO parent FROM "CustomerStockMovement" WHERE id=NEW."varianceOfId";
      IF parent.kind NOT IN ('TRANSFER','COUNT') OR NEW."updatedById"<>parent."updatedById" OR NEW."createdById"<>COALESCE(parent."dispatchedById",parent."createdById") OR NEW."evidenceId" IS DISTINCT FROM parent."evidenceId" THEN RAISE EXCEPTION 'Variance must preserve verified evidence and actors'; END IF;
    END IF;
    IF NEW."correctionOfId" IS NOT NULL THEN
      SELECT * INTO parent FROM "CustomerStockMovement" WHERE id=NEW."correctionOfId";
      IF NEW.kind<>'ADJUSTMENT' OR parent.kind<>'ADJUSTMENT' OR parent.status<>'POSTED' OR parent."sourceLocationId"<>NEW."sourceLocationId" OR parent."materialId"<>NEW."materialId" OR parent."unitId"<>NEW."unitId" THEN RAISE EXCEPTION 'Correction must reference a posted adjustment of the same stock key'; END IF;
    END IF;
  ELSE
    IF NEW."varianceOfId" IS NOT NULL AND NEW.status IN ('CANCELLED','REJECTED') THEN RAISE EXCEPTION 'Verified variance cannot be discarded'; END IF;
    IF NOT (OLD.status='REQUESTED' AND (NEW.status='APPROVED' OR (NEW.kind='ISSUE' AND NEW.status='REQUESTED')))
      AND (NEW."approvedById" IS DISTINCT FROM OLD."approvedById" OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt") THEN RAISE EXCEPTION 'Approval evidence is immutable after decision'; END IF;
    IF NOT (NEW.kind='TRANSFER' AND OLD.status='APPROVED' AND NEW.status='DISPATCHED')
      AND (NEW."dispatchedById" IS DISTINCT FROM OLD."dispatchedById" OR NEW."dispatchedAt" IS DISTINCT FROM OLD."dispatchedAt") THEN RAISE EXCEPTION 'Dispatch evidence is immutable'; END IF;
    IF OLD.status IN ('DISPATCHED','ISSUED') AND NEW."unitCost" IS DISTINCT FROM OLD."unitCost" THEN RAISE EXCEPTION 'Carrying cost is fixed at issue/dispatch'; END IF;
    IF NOT (NEW.kind='TRANSFER' AND OLD.status='DISPATCHED' AND NEW.status='RECEIVED') AND NEW."evidenceId" IS DISTINCT FROM OLD."evidenceId" THEN RAISE EXCEPTION 'Submitted evidence cannot be replaced'; END IF;
    IF NEW.kind='TRANSFER' AND NEW.status='RECEIVED' AND destination."siteId" IS NOT NULL AND (NEW."receiptGpsCapturedAt" IS NULL OR NEW."receiptGpsCapturedAt" NOT BETWEEN CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND CURRENT_TIMESTAMP+INTERVAL '15 minutes') THEN RAISE EXCEPTION 'Fresh destination GPS required'; END IF;
    IF NEW.kind='TRANSFER' AND NEW.status='DISPATCHED' THEN
      SELECT COALESCE((SELECT "quantityOnHand" FROM "InventoryStockBalance" WHERE "locationId"=source.id AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId"),0) INTO book;
      SELECT COALESCE(SUM(quantity),0) INTO reserved FROM "CustomerStockMovement" WHERE kind='TRANSFER' AND status='DISPATCHED' AND "sourceLocationId"=source.id AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId" AND id<>NEW.id;
      IF book-reserved<NEW.quantity THEN RAISE EXCEPTION 'Insufficient unreserved stock to dispatch'; END IF;
      IF NEW."dispatchedById" IS DISTINCT FROM NEW."updatedById" THEN RAISE EXCEPTION 'Dispatch actor mismatch'; END IF;
      IF EXISTS (SELECT 1 FROM "CustomerStockMovement" WHERE kind='COUNT' AND status='REQUESTED' AND "sourceLocationId"=source.id AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId") THEN RAISE EXCEPTION 'Finish physical count before dispatch'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerMovement_00_hardening" BEFORE INSERT OR UPDATE ON "CustomerStockMovement" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_movement_hardening"();

CREATE FUNCTION "kdipl_customer_reservation_guard"() RETURNS TRIGGER AS $$
DECLARE reserved DECIMAL(18,3); book DECIMAL(18,3); is_out BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(6062026::bigint);
  is_out := NEW.type IN ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT') OR (NEW.type='REVERSAL' AND EXISTS (SELECT 1 FROM "StockTransaction" WHERE id=NEW."reversalOfId" AND type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN')));
  IF is_out THEN
    SELECT COALESCE(SUM(quantity),0) INTO reserved FROM "CustomerStockMovement" WHERE kind='TRANSFER' AND status='DISPATCHED' AND "sourceLocationId"=NEW."locationId" AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId";
    SELECT COALESCE((SELECT "quantityOnHand" FROM "InventoryStockBalance" WHERE "locationId"=NEW."locationId" AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId"),0) INTO book;
    IF reserved>0 AND book-NEW.quantity<reserved THEN RAISE EXCEPTION 'Ledger movement cannot consume dispatched stock reservations'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockTransaction_01_reservations" BEFORE INSERT ON "StockTransaction" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_reservation_guard"();

CREATE FUNCTION "kdipl_customer_stock_source_required"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_IN','TRANSFER_OUT')
    OR (NEW.type='REVERSAL' AND EXISTS (SELECT 1 FROM "CustomerMovementPosting" WHERE "transactionId"=NEW."reversalOfId")) THEN
    IF NOT EXISTS (SELECT 1 FROM "CustomerMovementPosting" WHERE "transactionId"=NEW.id) THEN RAISE EXCEPTION 'Transfer/adjustment ledger entries require an authorized customer workflow'; END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "StockTransaction_customer_source_required" AFTER INSERT ON "StockTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_stock_source_required"();
