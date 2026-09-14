-- Additive controls: do not replace the Phase 5 receipt, file, amendment, or
-- negative-stock triggers. Ledger mutations remain append-only.
ALTER TABLE "CustomerStockMovement" ADD CONSTRAINT "CustomerMovement_shape" CHECK (
  "kind" IN ('ISSUE','TRANSFER','RETURN','ADJUSTMENT','COUNT','NON_USABLE')
  AND "status" IN ('REQUESTED','APPROVED','DISPATCHED','ISSUED','ACKNOWLEDGED','RECEIVED','POSTED','VERIFIED','REJECTED','CANCELLED')
  AND "quantity" >= 0 AND ("kind" = 'COUNT' OR "quantity" > 0)
  AND COALESCE("approvedQuantity" >= "quantity",true)
  AND COALESCE("actualQuantity" >= 0,true)
  AND COALESCE("unitCost" >= 0,true)
  AND LENGTH(BTRIM("reason")) >= 3 AND LENGTH(BTRIM("transitionReason")) >= 3
  AND "direction" IN ('IN','OUT') AND "disposition" IN ('DISPOSAL','SALE')
  AND ("kind" NOT IN ('ISSUE','TRANSFER','RETURN') OR ("destinationLocationId" IS NOT NULL AND "destinationLocationId" <> "sourceLocationId"))
  AND ("kind" <> 'RETURN' OR "originalIssueId" IS NOT NULL)
  AND ("kind" <> 'COUNT' OR ("closureProjectId" IS NOT NULL AND "bookQuantity" IS NOT NULL))
  AND ("kind" NOT IN ('ADJUSTMENT','COUNT','NON_USABLE') OR "evidenceId" IS NOT NULL)
  AND ("kind" <> 'NON_USABLE' OR ("category" IS NOT NULL AND "category" IN ('NORMAL_WASTAGE','DAMAGE','THEFT_LOSS','BREAKAGE','SCRAP','OBSOLETE') AND "direction"='OUT'))
  AND ("kind" NOT IN ('ISSUE','RETURN') OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "gpsCapturedAt" IS NOT NULL))
  AND COALESCE("latitude" BETWEEN -90 AND 90,true) AND COALESCE("longitude" BETWEEN -180 AND 180,true)
  AND COALESCE("receiptLatitude" BETWEEN -90 AND 90,true) AND COALESCE("receiptLongitude" BETWEEN -180 AND 180,true)
  AND ("status" NOT IN ('APPROVED','DISPATCHED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
  AND ("status" <> 'DISPATCHED' OR ("dispatchedById" IS NOT NULL AND "dispatchedAt" IS NOT NULL AND "unitCost" IS NOT NULL))
);
ALTER TABLE "CustomerMovementPosting" ADD CONSTRAINT "CustomerPosting_cost" CHECK ("unitCost" >= 0 AND "leg" IN ('SOURCE','DESTINATION','ADJUSTMENT','REVERSAL'));
ALTER TABLE "ProjectStockClosure" ADD CONSTRAINT "ProjectClosure_state" CHECK (("status"='OPEN' AND "closedAt" IS NULL) OR ("status"='CLOSED' AND "closedAt" IS NOT NULL));
CREATE UNIQUE INDEX "CustomerMovement_one_live_count" ON "CustomerStockMovement" ("sourceLocationId","materialId","unitId") WHERE "kind"='COUNT' AND "status"='REQUESTED';
CREATE UNIQUE INDEX "CustomerMovement_one_live_correction" ON "CustomerStockMovement" ("correctionOfId") WHERE "correctionOfId" IS NOT NULL AND "status" NOT IN ('REJECTED','CANCELLED');

CREATE FUNCTION "kdipl_customer_has_role"(actor UUID, code TEXT) RETURNS BOOLEAN AS $$
 SELECT EXISTS (SELECT 1 FROM "User" u JOIN "UserRole" ur ON ur."userId"=u.id JOIN "Role" r ON r.id=ur."roleId" WHERE u.id=actor AND u.status='ACTIVE' AND r.code=$2 AND r."isActive")
 AND NOT EXISTS (SELECT 1 FROM "UserRole" ur JOIN "Role" r ON r.id=ur."roleId" WHERE ur."userId"=actor AND r.code='SYSTEM_ADMINISTRATOR' AND r."isActive");
$$ LANGUAGE SQL STABLE;

CREATE FUNCTION "kdipl_customer_assigned"(actor UUID, scope UUID, is_site BOOLEAN) RETURNS BOOLEAN AS $$
 SELECT CASE WHEN is_site THEN EXISTS (
   SELECT 1 FROM "SiteAssignment" a JOIN "User" u ON u."employeeId"=a."employeeId"
   WHERE u.id=actor AND a."siteId"=scope AND a.role='SITE_SUPERVISOR' AND a."isActive" AND a."startsAt"<=CURRENT_TIMESTAMP AND (a."endsAt" IS NULL OR a."endsAt">CURRENT_TIMESTAMP)
 ) ELSE EXISTS (
   SELECT 1 FROM "ProjectAssignment" a JOIN "User" u ON u."employeeId"=a."employeeId"
   WHERE u.id=actor AND a."projectId"=scope AND a.role='PROJECT_MANAGER' AND a."isActive" AND a."startsAt"<=CURRENT_TIMESTAMP AND (a."endsAt" IS NULL OR a."endsAt">CURRENT_TIMESTAMP)
 ) END;
$$ LANGUAGE SQL STABLE;

CREATE FUNCTION "kdipl_customer_movement_guard"() RETURNS TRIGGER AS $$
DECLARE
  source "InventoryLocation"; destination "InventoryLocation";
  required_role TEXT; original "CustomerStockMovement"; parent "CustomerStockMovement";
BEGIN
  PERFORM pg_advisory_xact_lock(6062026::bigint);
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Movement records cannot be deleted'; END IF;
  SELECT * INTO source FROM "InventoryLocation" WHERE id=NEW."sourceLocationId";
  SELECT * INTO destination FROM "InventoryLocation" WHERE id=NEW."destinationLocationId";
  IF NOT source."isActive" OR (NEW."destinationLocationId" IS NOT NULL AND NOT destination."isActive") THEN RAISE EXCEPTION 'Movement locations must be active'; END IF;
  IF NEW."evidenceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FileRecord" WHERE id=NEW."evidenceId" AND "scanStatus"='CLEAN' AND "retentionUntil">CURRENT_DATE AND "documentType"='STOCK_MOVEMENT_EVIDENCE') THEN RAISE EXCEPTION 'Clean retained movement evidence required'; END IF;
  IF NEW.kind='NON_USABLE' AND source."siteId" IS NOT NULL AND NEW.category IN ('DAMAGE','THEFT_LOSS') AND (NEW.latitude IS NULL OR NEW.longitude IS NULL OR NEW."gpsCapturedAt" IS NULL) THEN RAISE EXCEPTION 'Site damage/loss requires GPS and evidence'; END IF;
  IF NEW.kind='ISSUE' AND (destination."siteId" IS NULL OR (source."projectId" IS NOT NULL AND source."projectId"<>destination."projectId")) THEN RAISE EXCEPTION 'Invalid issue site/project scope'; END IF;
  IF NEW.kind='RETURN' THEN
    SELECT * INTO original FROM "CustomerStockMovement" WHERE id=NEW."originalIssueId";
    IF original.kind IS DISTINCT FROM 'ISSUE' OR original.status IS DISTINCT FROM 'ACKNOWLEDGED' OR original."destinationLocationId"<>source.id OR original."sourceLocationId"<>destination.id OR original."materialId"<>NEW."materialId" OR original."unitId"<>NEW."unitId" THEN RAISE EXCEPTION 'Return must reference its original acknowledged issue'; END IF;
    IF NEW.status NOT IN ('CANCELLED','REJECTED') AND NEW.quantity + COALESCE((SELECT SUM(quantity) FROM "CustomerStockMovement" WHERE "originalIssueId"=original.id AND id<>NEW.id AND status NOT IN ('CANCELLED','REJECTED')),0)>original."actualQuantity" THEN RAISE EXCEPTION 'Return exceeds issued quantity'; END IF;
  END IF;
  IF NEW.kind='COUNT' AND NOT EXISTS (SELECT 1 FROM "ProjectStockClosure" WHERE "projectId"=source."projectId" AND "projectId"=NEW."closureProjectId" AND status='OPEN') THEN RAISE EXCEPTION 'Counts are allowed only during project closure'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'REQUESTED' OR NEW."approvedById" IS NOT NULL OR NEW."actualQuantity" IS NOT NULL OR NEW."dispatchedById" IS NOT NULL THEN RAISE EXCEPTION 'New movement must be an unapproved request'; END IF;
    IF NEW."varianceOfId" IS NOT NULL THEN
      SELECT * INTO parent FROM "CustomerStockMovement" WHERE id=NEW."varianceOfId";
      IF NEW.kind<>'ADJUSTMENT' OR parent.status NOT IN ('RECEIVED','VERIFIED') OR parent."sourceLocationId"<>NEW."sourceLocationId" OR parent."materialId"<>NEW."materialId" OR parent."unitId"<>NEW."unitId" OR NOT "kdipl_customer_has_role"(NEW."createdById",'STORE_KEEPER') THEN RAISE EXCEPTION 'Invalid separately prepared variance'; END IF;
      IF (parent.kind='TRANSFER' AND (NEW.quantity<>parent.quantity-parent."actualQuantity" OR NEW.direction<>'OUT')) OR (parent.kind='COUNT' AND (NEW.quantity<>ABS(parent.quantity-parent."bookQuantity") OR NEW.direction<>CASE WHEN parent.quantity>parent."bookQuantity" THEN 'IN' ELSE 'OUT' END)) THEN RAISE EXCEPTION 'Variance does not match physical verification'; END IF;
      RETURN NEW;
    END IF;
    required_role := CASE WHEN NEW.kind IN ('ISSUE','RETURN') THEN 'SITE_SUPERVISOR' WHEN NEW."closureProjectId" IS NOT NULL AND NEW.kind='TRANSFER' THEN 'PROJECT_DIRECTOR' ELSE 'STORE_KEEPER' END;
    IF required_role='SITE_SUPERVISOR' AND NOT "kdipl_customer_assigned"(NEW."createdById",CASE WHEN NEW.kind='ISSUE' THEN destination."siteId" ELSE source."siteId" END,true) THEN RAISE EXCEPTION 'Assigned Site Supervisor required'; END IF;
    IF NEW."updatedById"<>NEW."createdById" THEN RAISE EXCEPTION 'Invalid request actor'; END IF;
  ELSE
    IF OLD.status IN ('POSTED','ACKNOWLEDGED','RECEIVED','VERIFIED','REJECTED','CANCELLED') THEN RAISE EXCEPTION 'Completed movement is immutable; use reversal and replacement'; END IF;
    IF (to_jsonb(NEW)-ARRAY['status','approvedQuantity','actualQuantity','unitCost','transitionReason','evidenceId','receiptLatitude','receiptLongitude','receiptGpsCapturedAt','updatedById','approvedById','dispatchedById','approvedAt','dispatchedAt','completedAt','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','approvedQuantity','actualQuantity','unitCost','transitionReason','evidenceId','receiptLatitude','receiptLongitude','receiptGpsCapturedAt','updatedById','approvedById','dispatchedById','approvedAt','dispatchedAt','completedAt','updatedAt']) THEN RAISE EXCEPTION 'Submitted movement facts cannot be edited'; END IF;
    required_role := NULL;
    IF OLD.status='REQUESTED' AND NEW.status='CANCELLED' THEN required_role := CASE WHEN NEW.kind IN ('ISSUE','RETURN') THEN 'SITE_SUPERVISOR' ELSE 'STORE_KEEPER' END;
    ELSIF OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED') AND NEW.kind IN ('TRANSFER','ADJUSTMENT','NON_USABLE') THEN
      required_role := CASE WHEN NEW.kind='TRANSFER' THEN 'PROJECT_DIRECTOR' ELSE 'MANAGING_DIRECTOR' END;
      IF NEW.kind<>'TRANSFER' AND NEW."updatedById"=NEW."createdById" THEN RAISE EXCEPTION 'Creator cannot approve'; END IF;
      IF NEW.status='APPROVED' AND NEW."approvedById" IS DISTINCT FROM NEW."updatedById" THEN RAISE EXCEPTION 'Approval actor mismatch'; END IF;
    ELSIF NEW.kind='ISSUE' AND OLD.status='REQUESTED' AND NEW.status='REQUESTED' AND NEW."approvedQuantity">NEW.quantity THEN
      required_role := 'PROJECT_MANAGER';
      IF NOT "kdipl_customer_assigned"(NEW."updatedById",destination."projectId",false) OR NEW."approvedById" IS DISTINCT FROM NEW."updatedById" THEN RAISE EXCEPTION 'Assigned PM must approve excess'; END IF;
    ELSIF NEW.kind='ISSUE' AND OLD.status='REQUESTED' AND NEW.status='ISSUED' THEN
      required_role := 'STORE_KEEPER';
      IF NEW."actualQuantity" IS NULL OR NEW."actualQuantity"<=0 OR NEW."actualQuantity">COALESCE(OLD."approvedQuantity",OLD.quantity) THEN RAISE EXCEPTION 'Issue exceeds approved request'; END IF;
    ELSIF NEW.kind='ISSUE' AND OLD.status='ISSUED' AND NEW.status='ACKNOWLEDGED' THEN required_role := 'SITE_SUPERVISOR';
    ELSIF NEW.kind='TRANSFER' AND OLD.status='APPROVED' AND NEW.status='DISPATCHED' THEN required_role := 'STORE_KEEPER';
    ELSIF NEW.kind='TRANSFER' AND OLD.status='DISPATCHED' AND NEW.status='RECEIVED' THEN
      required_role := CASE WHEN destination."siteId" IS NOT NULL THEN 'SITE_SUPERVISOR' ELSE 'STORE_KEEPER' END;
      IF NEW."actualQuantity" IS NULL OR NEW."actualQuantity">OLD.quantity THEN RAISE EXCEPTION 'Actual receipt required'; END IF;
      IF destination."siteId" IS NOT NULL AND (NEW."receiptLatitude" IS NULL OR NEW."receiptLongitude" IS NULL OR NEW."receiptGpsCapturedAt" IS NULL) THEN RAISE EXCEPTION 'Site receipt requires GPS acknowledgment'; END IF;
      IF NEW."actualQuantity"<OLD.quantity AND NEW."evidenceId" IS NULL THEN RAISE EXCEPTION 'Shortage/damage requires evidence'; END IF;
    ELSIF NEW.kind='RETURN' AND OLD.status='REQUESTED' AND NEW.status='POSTED' THEN required_role := 'STORE_KEEPER';
    ELSIF NEW.kind='COUNT' AND OLD.status='REQUESTED' AND NEW.status='VERIFIED' THEN required_role := 'ACCOUNTS';
    ELSIF NEW.kind IN ('ADJUSTMENT','NON_USABLE') AND OLD.status='APPROVED' AND NEW.status='POSTED' THEN required_role := 'STORE_KEEPER';
    END IF;
    IF required_role IS NULL THEN RAISE EXCEPTION 'Invalid customer movement transition'; END IF;
    IF required_role='SITE_SUPERVISOR' AND NOT "kdipl_customer_assigned"(NEW."updatedById",CASE WHEN NEW.kind='RETURN' THEN source."siteId" ELSE destination."siteId" END,true) THEN RAISE EXCEPTION 'Assigned Site Supervisor required'; END IF;
    IF NOT (NEW.kind='ISSUE' AND OLD.status='REQUESTED' AND NEW.status='REQUESTED') AND (NEW."approvedQuantity" IS DISTINCT FROM OLD."approvedQuantity") THEN RAISE EXCEPTION 'Only PM excess approval can change the limit'; END IF;
  END IF;
  IF NOT "kdipl_customer_has_role"(NEW."updatedById",required_role) THEN RAISE EXCEPTION 'Movement role required: %',required_role; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerMovement_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CustomerStockMovement" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_movement_guard"();

-- The lock is acquired before the existing Phase 5 negative-stock calculation.
CREATE FUNCTION "kdipl_customer_ledger_lock"() RETURNS TRIGGER AS $$
DECLARE project_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(6062026::bigint);
  SELECT "projectId" INTO project_id FROM "InventoryLocation" WHERE id=NEW."locationId";
  IF EXISTS (SELECT 1 FROM "ProjectStockClosure" WHERE "projectId"=project_id AND status='CLOSED') THEN RAISE EXCEPTION 'Project stock is closed'; END IF;
  IF NEW.type='RECEIPT' AND EXISTS (SELECT 1 FROM "ProjectStockClosure" WHERE "projectId"=project_id) THEN RAISE EXCEPTION 'Resolve project closure before new goods receipts'; END IF;
  IF EXISTS (SELECT 1 FROM "CustomerStockMovement" WHERE kind='COUNT' AND status='REQUESTED' AND "sourceLocationId"=NEW."locationId" AND "materialId"=NEW."materialId" AND "unitId"=NEW."unitId") THEN RAISE EXCEPTION 'Physical count freezes this stock key until Accounts verification'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StockTransaction_00_customer_lock" BEFORE INSERT ON "StockTransaction" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_ledger_lock"();

CREATE TRIGGER "CustomerPosting_immutable" BEFORE UPDATE OR DELETE ON "CustomerMovementPosting" FOR EACH ROW EXECUTE FUNCTION "kdipl_reject_stock_transaction_mutation"();

-- Price is metadata attached to immutable quantity entries. No mutable balance.
CREATE VIEW "CustomerInventoryValuation" AS
SELECT s.id, s."locationId", s."materialId", s."unitId",
  (CASE WHEN s.type IN ('OPENING','RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') THEN s.quantity
    WHEN s.type='REVERSAL' AND original.type IN ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT') THEN s.quantity
    ELSE -s.quantity END)::DECIMAL(18,3) AS "signedQuantity",
  COALESCE(p."unitCost",po."unitPrice",op."unitCost",opo."unitPrice")::DECIMAL(24,6) AS "unitCost"
FROM "StockTransaction" s
LEFT JOIN "CustomerMovementPosting" p ON p."transactionId"=s.id
LEFT JOIN "GoodsReceiptLine" grn ON grn.id=s."goodsReceiptLineId"
LEFT JOIN "PurchaseOrderLine" po ON po.id=grn."purchaseOrderLineId"
LEFT JOIN "StockTransaction" original ON original.id=s."reversalOfId"
LEFT JOIN "CustomerMovementPosting" op ON op."transactionId"=original.id
LEFT JOIN "GoodsReceiptLine" ogrn ON ogrn.id=original."goodsReceiptLineId"
LEFT JOIN "PurchaseOrderLine" opo ON opo.id=ogrn."purchaseOrderLineId";
