-- A central-store deficit caused by a project issue still belongs to that
-- project's unresolved work, even though Central Store has no projectId.
CREATE OR REPLACE FUNCTION "kdipl_assert_customer_closure"(project_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(6062026::bigint);
  IF EXISTS (SELECT 1 FROM "InventoryStockBalance" b JOIN "InventoryLocation" l ON l.id=b."locationId" WHERE l."projectId"=project_id AND b."quantityOnHand"<>0) THEN RAISE EXCEPTION 'Remaining project/site stock must be transferred or adjusted before closure'; END IF;
  IF EXISTS (
    SELECT 1 FROM "TemporaryNegativeStockException" n JOIN "InventoryLocation" l ON l.id=n."locationId"
    LEFT JOIN "CustomerMovementPosting" posting ON posting."transactionId"=n."sourceTransactionId"
    LEFT JOIN "CustomerStockMovement" m ON m.id=posting."movementId"
    LEFT JOIN "InventoryLocation" destination ON destination.id=m."destinationLocationId"
    WHERE n.status='OPEN' AND (l."projectId"=project_id OR destination."projectId"=project_id OR m."closureProjectId"=project_id)
  ) THEN RAISE EXCEPTION 'Resolve all project-related negative-stock exceptions before closure'; END IF;
  IF EXISTS (SELECT 1 FROM "CustomerStockMovement" m JOIN "InventoryLocation" s ON s.id=m."sourceLocationId" LEFT JOIN "InventoryLocation" d ON d.id=m."destinationLocationId" WHERE (s."projectId"=project_id OR d."projectId"=project_id OR m."closureProjectId"=project_id) AND (m.status NOT IN ('POSTED','ACKNOWLEDGED','RECEIVED','VERIFIED','CANCELLED','REJECTED') OR (m."varianceOfId" IS NOT NULL AND m.status<>'POSTED'))) THEN RAISE EXCEPTION 'Resolve transfers, returns, acknowledgments, counts and adjustment variances before closure'; END IF;
  IF EXISTS (SELECT 1 FROM "GoodsReceipt" g JOIN "InventoryLocation" l ON l.id=g."locationId" WHERE l."projectId"=project_id AND g.status NOT IN ('POSTED','CANCELLED')) THEN RAISE EXCEPTION 'Resolve pending GRNs before closure'; END IF;
END;
$$ LANGUAGE plpgsql;
