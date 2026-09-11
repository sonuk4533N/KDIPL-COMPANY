CREATE TYPE "MaterialReconciliationPurpose" AS ENUM ('ROUTINE', 'PROJECT_CLOSE');

ALTER TABLE "MaterialReconciliation"
ADD COLUMN "purpose" "MaterialReconciliationPurpose" NOT NULL DEFAULT 'ROUTINE';

INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'inventory.reconcile', 'Record, post, and review issued-material reconciliation.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'inventory.reconcile'
WHERE role."code" IN ('STORE_KEEPER', 'SITE_SUPERVISOR', 'PROJECT_DIRECTOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Serialize against the issue line, preserve the cumulative issued-quantity
-- ceiling, and make a project-close reconciliation both complete and final.
CREATE OR REPLACE FUNCTION "kdipl_guard_reconciliation_post"()
RETURNS trigger AS $$
DECLARE
  issued_quantity DECIMAL(18,3);
  issue_status TEXT;
  previously_reconciled DECIMAL(18,3);
  has_final_reconciliation BOOLEAN;
  new_total DECIMAL(18,3);
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" <> 'POSTED' THEN
    SELECT line."quantity", issue."status"::text
    INTO issued_quantity, issue_status
    FROM "MaterialIssueLine" line
    JOIN "MaterialIssue" issue ON issue."id" = line."materialIssueId"
    WHERE line."id" = NEW."materialIssueLineId"
    FOR UPDATE OF line;

    IF NOT FOUND OR issue_status <> 'ACKNOWLEDGED' THEN
      RAISE EXCEPTION 'Only acknowledged issued material can be reconciled';
    END IF;

    SELECT
      COALESCE(SUM(
        reconciliation."consumedQuantity" + reconciliation."returnedQuantity"
        + reconciliation."wastageQuantity" + reconciliation."scrapQuantity"
      ), 0),
      COALESCE(BOOL_OR(reconciliation."purpose" = 'PROJECT_CLOSE'), FALSE)
    INTO previously_reconciled, has_final_reconciliation
    FROM "MaterialReconciliation" reconciliation
    WHERE reconciliation."materialIssueLineId" = NEW."materialIssueLineId"
      AND reconciliation."status" = 'POSTED'
      AND reconciliation."id" <> NEW."id";

    IF has_final_reconciliation THEN
      RAISE EXCEPTION 'Issued material is already finally reconciled for project close';
    END IF;

    new_total := previously_reconciled + NEW."consumedQuantity"
      + NEW."returnedQuantity" + NEW."wastageQuantity" + NEW."scrapQuantity";

    IF new_total > issued_quantity THEN
      RAISE EXCEPTION 'Issued-material reconciliation exceeds issued quantity';
    END IF;

    IF NEW."purpose" = 'PROJECT_CLOSE' AND new_total <> issued_quantity THEN
      RAISE EXCEPTION 'Project-close reconciliation must account for all remaining issued quantity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
