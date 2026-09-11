-- Register the physical-count permission and converge operational/review grants.
INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'inventory.count', 'Prepare, review, and post controlled physical stock counts.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'inventory.count'
WHERE role."code" IN ('STORE_KEEPER', 'PROJECT_DIRECTOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
