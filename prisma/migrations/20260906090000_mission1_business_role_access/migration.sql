-- Store Keepers need application-shell access before their already-granted
-- Phase 5 inventory permissions are usable. Repeat the inventory grants here
-- so existing environments converge safely and idempotently.
INSERT INTO "RolePermission" ("roleId", "permissionId", "grantedAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
JOIN "Permission" permission
  ON permission."code" IN ('app.access', 'inventory.view', 'inventory.receive')
WHERE role."code" = 'STORE_KEEPER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
