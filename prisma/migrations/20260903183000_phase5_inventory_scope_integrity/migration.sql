ALTER TABLE "InventoryLocation"
DROP CONSTRAINT "InventoryLocation_siteId_fkey";

ALTER TABLE "InventoryLocation"
ADD CONSTRAINT "InventoryLocation_siteId_projectId_fkey"
FOREIGN KEY ("siteId", "projectId")
REFERENCES "Site"("id", "projectId")
ON DELETE RESTRICT
ON UPDATE CASCADE;
