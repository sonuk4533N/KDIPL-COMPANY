-- Remove legacy read grants that expose unrelated business modules to Store
-- Keepers. Their Phase 5 scope is application-shell access, inventory
-- visibility, and receiving operations only.
DELETE FROM "RolePermission" role_permission
USING "Role" role, "Permission" permission
WHERE role_permission."roleId" = role."id"
  AND role_permission."permissionId" = permission."id"
  AND role."code" = 'STORE_KEEPER'
  AND permission."code" IN (
    'catalog.view',
    'project.view',
    'purchase.view',
    'site.view'
  );
