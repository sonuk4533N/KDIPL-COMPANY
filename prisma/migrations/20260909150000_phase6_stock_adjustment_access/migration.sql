-- Store Keepers prepare/post adjustments; Project Directors independently decide them.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
  ON permission."code" IN ('inventory.view', 'inventory.adjust')
WHERE role."code" = 'PROJECT_DIRECTOR'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'inventory.adjust'
WHERE role."code" = 'STORE_KEEPER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
