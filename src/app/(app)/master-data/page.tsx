import { PageHeader } from "@/components/shared/page-header";
import { ApplicationState } from "@/components/ui/states";
import { CatalogManagement } from "@/features/catalog/catalog-management";
import { getCatalogWorkspace } from "@/features/catalog/catalog-queries";
import { requireCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function MasterDataPage() {
  const principal = await requireCurrentPrincipal();
  const permissions = {
    canViewCatalog: hasPermission(principal, "catalog.view"),
    canManageCatalog: hasPermission(principal, "catalog.manage"),
    canViewSuppliers: hasPermission(principal, "supplier.view"),
    canManageSuppliers: hasPermission(principal, "supplier.manage"),
  };

  if (!permissions.canViewCatalog && !permissions.canViewSuppliers) {
    return (
      <ApplicationState
        kind="forbidden"
        title="Master data access required"
        description="You need catalog or supplier visibility to use this workspace. Contact a system administrator if your responsibilities have changed."
      />
    );
  }

  const workspace = await getCatalogWorkspace(principal);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Phase 2 · Project foundation"
        title="Master data"
        description="Maintain the controlled clients, materials, categories, units, and suppliers that future KDIPL operational transactions will reference."
      />
      <CatalogManagement workspace={workspace} permissions={permissions} />
    </div>
  );
}
