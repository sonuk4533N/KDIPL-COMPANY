-- SQL CHECK treats NULL as satisfied, so make required decision notes explicit.
ALTER TABLE "StockAdjustment" DROP CONSTRAINT "StockAdjustment_decision_notes_check";
ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_decision_notes_check" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED', 'POSTED')
    OR COALESCE(LENGTH(BTRIM("decisionNotes")), 0) > 0
  ) NOT VALID;

ALTER TABLE "StockCount" DROP CONSTRAINT "StockCount_decision_notes_check";
ALTER TABLE "StockCount"
  ADD CONSTRAINT "StockCount_decision_notes_check" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED', 'POSTED')
    OR COALESCE(LENGTH(BTRIM("decisionNotes")), 0) > 0
  ) NOT VALID;
