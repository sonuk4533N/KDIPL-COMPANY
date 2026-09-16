import { ClipboardCheck, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ApplicationState } from "@/components/ui/states";
import { RequirementList } from "@/features/requirements/requirement-list";
import { getRequirementWorkspace } from "@/features/requirements/requirement-queries";
import { FinancePage } from "@/features/finance/finance-page";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function ApprovalsPage() {
  const principal = await getCurrentPrincipal();
  if (
    principal &&
    (hasPermission(principal, "invoice.approve") ||
      hasPermission(principal, "payment.approve")) &&
    !hasPermission(principal, "material_requirement.view")
  )
    return <FinancePage mode="invoices" />;
  if (!principal || !hasPermission(principal, "material_requirement.view")) {
    return (
      <ApplicationState
        kind="forbidden"
        title="Approval access required"
        description="You need material requirement visibility to open this queue."
      />
    );
  }
  const workspace = await getRequirementWorkspace(principal);
  const pending = workspace.requirements.filter(
    ({ status }) => status === "SUBMITTED",
  );
  const actionableCount = pending.filter(
    ({ capabilities }) => capabilities.canDecide,
  ).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Phase 3 · Controlled decisions"
        title="Requirement approvals"
        description="Review submitted material requirements under live assignment, role, and separation-of-duties checks."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent>
            <ClipboardCheck className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Visible submissions</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {pending.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <ShieldCheck className="size-5 text-emerald-700" />
            <p className="mt-3 text-sm text-slate-500">
              Awaiting your decision
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {actionableCount}
            </p>
          </CardContent>
        </Card>
      </div>
      <RequirementList
        requirements={pending}
        title="Submitted requirements"
        emptyTitle="No submitted requirements"
        emptyDescription="New submissions within your visibility scope will appear here."
      />
    </div>
  );
}
