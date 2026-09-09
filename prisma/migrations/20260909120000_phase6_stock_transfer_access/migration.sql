-- Converge transfer workflow permissions for operational inventory roles.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'inventory.transfer'
WHERE role."code" IN ('STORE_KEEPER', 'SITE_SUPERVISOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
