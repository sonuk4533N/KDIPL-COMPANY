-- Store Keepers create and post material issues. Site Supervisors acknowledge
-- only issues addressed to sites where they have an active assignment; that
-- data-scope rule is enforced by the server command layer.
INSERT INTO "RolePermission" ("roleId", "permissionId", "grantedAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'inventory.issue'
WHERE role."code" IN ('STORE_KEEPER', 'SITE_SUPERVISOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
