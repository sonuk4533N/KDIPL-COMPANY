import { ApplicationState } from "@/components/ui/states";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";
import { getFinanceWorkspace } from "./finance-queries";
import { FinanceWorkspaceView, type FinanceMode } from "./finance-workspace";

const titles: Record<FinanceMode, string> = {
  overview: "Accounts payable",
  invoices: "Supplier invoices",
  "new-invoice": "Supplier invoice entry",
  matching: "Three-way matching & mismatch review",
  payments: "Supplier payments",
  advances: "Supplier advances",
  notes: "Credit and debit notes",
  tax: "GST, TDS and tax settings",
  tally: "TallyPrime export queue",
  reports: "Accounts payable reports",
};

export async function FinancePage({ mode }: { mode: FinanceMode }) {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "invoice.view"))
    return (
      <ApplicationState
        kind="forbidden"
        title="Accounts access required"
        description="Financial records require an authorized Accounts, Accounts Admin, Managing Director, or support role."
      />
    );
  const workspace = await getFinanceWorkspace(principal);
  return (
    <main className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-700">
          Phase 7 · financial control
        </p>
        <h1 className="text-2xl font-semibold">{titles[mode]}</h1>
      </div>
      <FinanceWorkspaceView w={workspace} mode={mode} />
    </main>
  );
}
