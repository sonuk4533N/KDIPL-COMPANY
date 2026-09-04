INSERT INTO "RolePermission" ("roleId", "permissionId", "grantedAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('inventory.view', 'inventory.receive')
WHERE r."code" = 'SITE_SUPERVISOR'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
