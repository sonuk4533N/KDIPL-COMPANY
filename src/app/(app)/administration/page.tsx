import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { ApplicationState } from "@/components/ui/states";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function Page() {
  const principal = await getCurrentPrincipal();
  if (
    !hasPermission(principal, "user.manage") &&
    !hasPermission(principal, "role.manage")
  )
    return (
      <ApplicationState
        kind="forbidden"
        title="Administration access required"
        description="You do not have permission to manage users or roles. Contact a system administrator if your responsibilities have changed."
      />
    );
  return (
    <ModulePlaceholder
      title="Administration"
      description="The bootstrap administrator can access this secured route. Full management screens belong to Phase 1."
      phase="Phase 1 — Authentication, Employees, Users, Roles & Permissions"
    />
  );
}
