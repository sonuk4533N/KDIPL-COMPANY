import Link from "next/link";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";
import { ApplicationState } from "@/components/ui/states";
import { getCustomerMovementWorkspace } from "@/features/inventory/customer-movement-queries";
import { CustomerMovementWorkspaceView } from "@/features/inventory/customer-movement-workspace";

export default async function CustomerMovementsPage() {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "inventory.view"))
    return (
      <ApplicationState
        kind="forbidden"
        title="Inventory access required"
        description="Stock movements require inventory visibility and the relevant business role."
      />
    );
  const workspace = await getCustomerMovementWorkspace(principal);
  return (
    <main className="space-y-5">
      <Link className="text-sm underline" href="/inventory">
        Back to receiving and stock ledger
      </Link>
      <h1 className="text-2xl font-semibold">
        Stock movements & project closure
      </h1>
      <CustomerMovementWorkspaceView workspace={workspace} />
    </main>
  );
}
