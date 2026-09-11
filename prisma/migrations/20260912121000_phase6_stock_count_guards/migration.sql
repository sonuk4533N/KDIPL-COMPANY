-- Enforce physical-count decision evidence and separation of duties below the app layer.
ALTER TABLE "StockCount"
  ADD CONSTRAINT "StockCount_decision_separation_check" CHECK (
    "decidedById" IS NULL
    OR (
      "decidedById" <> "createdById"
      AND ("submittedById" IS NULL OR "decidedById" <> "submittedById")
    )
  ) NOT VALID;

ALTER TABLE "StockCount"
  ADD CONSTRAINT "StockCount_decision_notes_check" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED', 'POSTED')
    OR LENGTH(BTRIM("decisionNotes")) > 0
  ) NOT VALID;
