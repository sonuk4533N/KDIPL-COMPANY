CREATE FUNCTION "kdipl_assert_customer_closure"(project_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(6062026::bigint);
  IF EXISTS (SELECT 1 FROM "InventoryStockBalance" b JOIN "InventoryLocation" l ON l.id=b."locationId" WHERE l."projectId"=project_id AND b."quantityOnHand"<>0) THEN RAISE EXCEPTION 'Remaining project/site stock must be transferred or adjusted before closure'; END IF;
  IF EXISTS (SELECT 1 FROM "TemporaryNegativeStockException" n JOIN "InventoryLocation" l ON l.id=n."locationId" WHERE l."projectId"=project_id AND n.status='OPEN') THEN RAISE EXCEPTION 'Resolve all negative-stock exceptions before closure'; END IF;
  IF EXISTS (SELECT 1 FROM "CustomerStockMovement" m JOIN "InventoryLocation" s ON s.id=m."sourceLocationId" LEFT JOIN "InventoryLocation" d ON d.id=m."destinationLocationId" WHERE (s."projectId"=project_id OR d."projectId"=project_id OR m."closureProjectId"=project_id) AND (m.status NOT IN ('POSTED','ACKNOWLEDGED','RECEIVED','VERIFIED','CANCELLED','REJECTED') OR (m."varianceOfId" IS NOT NULL AND m.status<>'POSTED'))) THEN RAISE EXCEPTION 'Resolve transfers, returns, acknowledgments, counts and adjustment variances before closure'; END IF;
  IF EXISTS (SELECT 1 FROM "GoodsReceipt" g JOIN "InventoryLocation" l ON l.id=g."locationId" WHERE l."projectId"=project_id AND g.status NOT IN ('POSTED','CANCELLED')) THEN RAISE EXCEPTION 'Resolve pending GRNs before closure'; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "kdipl_customer_closure_guard"() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(6062026::bigint);
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Closure history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'OPEN' OR NOT "kdipl_customer_has_role"(NEW."createdById",'PROJECT_DIRECTOR') THEN RAISE EXCEPTION 'Project Director must start closure'; END IF;
  ELSE
    IF OLD.status<>'OPEN' OR NEW.status<>'CLOSED' OR NEW."projectId"<>OLD."projectId" OR NEW."createdById"<>OLD."createdById" OR NEW."createdAt"<>OLD."createdAt" THEN RAISE EXCEPTION 'Invalid or immutable closure transition'; END IF;
    PERFORM "kdipl_assert_customer_closure"(NEW."projectId");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerClosure_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectStockClosure" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_closure_guard"();

CREATE FUNCTION "kdipl_customer_project_completion_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('COMPLETED','CANCELLED') AND OLD.status NOT IN ('COMPLETED','CANCELLED') THEN
    PERFORM pg_advisory_xact_lock(6062026::bigint);
    -- Projects without any inventory history keep the Phase 2 administrative
    -- lifecycle. Stock-bearing projects must use the explicit closure workflow.
    IF EXISTS (SELECT 1 FROM "StockTransaction" s JOIN "InventoryLocation" l ON l.id=s."locationId" WHERE l."projectId"=NEW.id)
       AND NOT EXISTS (SELECT 1 FROM "ProjectStockClosure" WHERE "projectId"=NEW.id AND status='CLOSED') THEN RAISE EXCEPTION 'Use project stock closure before completing this project'; END IF;
    PERFORM "kdipl_assert_customer_closure"(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Project_customer_completion" BEFORE UPDATE ON "Project" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_project_completion_guard"();

CREATE FUNCTION "kdipl_customer_posting_guard"() RETURNS TRIGGER AS $$
DECLARE m "CustomerStockMovement"; s "StockTransaction";
BEGIN
  SELECT * INTO m FROM "CustomerStockMovement" WHERE id=NEW."movementId";
  SELECT * INTO s FROM "StockTransaction" WHERE id=NEW."transactionId";
  IF s."materialId"<>m."materialId" OR s."unitId"<>m."unitId" OR s.reason<>m."transitionReason" THEN RAISE EXCEPTION 'Posting facts do not match the approved movement'; END IF;
  IF NEW.leg IN ('SOURCE','DESTINATION') THEN
    IF (m.kind='ISSUE' AND m.status NOT IN ('ISSUED','ACKNOWLEDGED')) OR (m.kind='TRANSFER' AND m.status<>'RECEIVED') OR (m.kind='RETURN' AND m.status<>'POSTED') OR m.kind NOT IN ('ISSUE','TRANSFER','RETURN') THEN RAISE EXCEPTION 'Movement cannot post stock before physical issue/receipt'; END IF;
    IF s.quantity<>(CASE WHEN m.kind='RETURN' THEN m.quantity ELSE m."actualQuantity" END) OR NEW."unitCost" IS DISTINCT FROM m."unitCost" THEN RAISE EXCEPTION 'Quantity/cost must match actual movement'; END IF;
    IF NEW.leg='SOURCE' AND (s."locationId"<>m."sourceLocationId" OR s.type<>CASE WHEN m.kind='ISSUE' THEN 'ISSUE'::"StockTransactionType" ELSE 'TRANSFER_OUT'::"StockTransactionType" END) THEN RAISE EXCEPTION 'Invalid source ledger entry'; END IF;
    IF NEW.leg='DESTINATION' AND (s."locationId"<>m."destinationLocationId" OR s.type<>'TRANSFER_IN') THEN RAISE EXCEPTION 'Invalid destination ledger entry'; END IF;
  ELSE
    IF m.kind NOT IN ('ADJUSTMENT','NON_USABLE') OR m.status<>'POSTED' OR m."approvedById" IS NULL OR m."approvedById"=m."createdById" OR NOT "kdipl_customer_has_role"(m."approvedById",'MANAGING_DIRECTOR') THEN RAISE EXCEPTION 'Independent MD approval required for adjustment posting'; END IF;
    IF NEW.leg='ADJUSTMENT' AND (s.quantity<>m.quantity OR NEW."unitCost" IS DISTINCT FROM m."unitCost" OR s."locationId"<>m."sourceLocationId" OR s.type<>CASE WHEN m.direction='IN' AND m.kind='ADJUSTMENT' THEN 'ADJUSTMENT_IN'::"StockTransactionType" ELSE 'ADJUSTMENT_OUT'::"StockTransactionType" END) THEN RAISE EXCEPTION 'Adjustment posting does not match approval'; END IF;
    IF NEW.leg='REVERSAL' AND (m."correctionOfId" IS NULL OR s.type<>'REVERSAL' OR NOT EXISTS (SELECT 1 FROM "CustomerMovementPosting" p JOIN "StockTransaction" original ON original.id=p."transactionId" WHERE p."movementId"=m."correctionOfId" AND p.leg='ADJUSTMENT' AND p."transactionId"=s."reversalOfId" AND original.quantity=s.quantity AND p."unitCost"=NEW."unitCost")) THEN RAISE EXCEPTION 'Correction must reverse the exact original adjustment'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerPosting_guard" BEFORE INSERT ON "CustomerMovementPosting" FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_posting_guard"();

CREATE FUNCTION "kdipl_customer_posting_complete"() RETURNS TRIGGER AS $$
DECLARE m "CustomerStockMovement"; expected INTEGER; actual INTEGER;
BEGIN
  SELECT * INTO m FROM "CustomerStockMovement" WHERE id=NEW.id;
  expected := 0;
  IF (m.kind='ISSUE' AND m.status IN ('ISSUED','ACKNOWLEDGED')) OR (m.kind='TRANSFER' AND m.status='RECEIVED') THEN expected := CASE WHEN m."actualQuantity">0 THEN 2 ELSE 0 END;
  ELSIF m.kind='RETURN' AND m.status='POSTED' THEN expected := 2;
  ELSIF m.kind IN ('ADJUSTMENT','NON_USABLE') AND m.status='POSTED' THEN expected := CASE WHEN m."correctionOfId" IS NOT NULL THEN 2 ELSE 1 END;
  END IF;
  SELECT COUNT(*) INTO actual FROM "CustomerMovementPosting" WHERE "movementId"=m.id;
  IF actual<>expected THEN RAISE EXCEPTION 'Final posting must atomically include every quantity and cost ledger leg'; END IF;
  IF (m.kind='TRANSFER' AND m.status='RECEIVED' AND m."actualQuantity"<m.quantity) OR (m.kind='COUNT' AND m.status='VERIFIED' AND m.quantity<>m."bookQuantity") THEN
    IF NOT EXISTS (SELECT 1 FROM "CustomerStockMovement" WHERE "varianceOfId"=m.id AND kind='ADJUSTMENT') THEN RAISE EXCEPTION 'Physical variance requires a separate audited MD adjustment'; END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "CustomerMovement_complete_posting" AFTER INSERT OR UPDATE ON "CustomerStockMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "kdipl_customer_posting_complete"();
