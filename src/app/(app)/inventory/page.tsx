import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  PackageCheck,
  Warehouse,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApplicationState } from "@/components/ui/states";
import { StatusBadge, type StandardStatus } from "@/components/ui/status-badge";
import { GoodsReceiptForm } from "@/features/inventory/goods-receipt-form";
import { GrnDraftControls } from "@/features/inventory/grn-draft-controls";
import { GrnExceptionControls } from "@/features/inventory/grn-exception-controls";
import { GrnPostButton } from "@/features/inventory/grn-post-button";
import { getInventoryWorkspace } from "@/features/inventory/inventory-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

function exceptionStatusLabel(status: string): StandardStatus {
  const labels: Record<string, StandardStatus> = {
    OPEN: "Open",
    REPLACEMENT_EXPECTED: "Replacement expected",
    RETURN_PENDING: "Return pending",
    RETURNED: "Returned",
    RESOLVED: "Resolved",
  };
  return labels[status] ?? "Open";
}

export default async function InventoryPage() {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "inventory.view")) {
    return (
      <ApplicationState
        kind="forbidden"
        title="Inventory access required"
        description="You need inventory visibility to open the stock and receiving workspace."
      />
    );
  }

  const workspace = await getInventoryWorkspace(principal);
  const canCreateGrn =
    hasPermission(principal, "purchase.create") &&
    principal.roleCodes.includes("PURCHASE_MANAGER") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const canVerifyGrn =
    hasPermission(principal, "inventory.receive") &&
    principal.roleCodes.includes("STORE_KEEPER") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const canApproveGrn =
    hasPermission(principal, "inventory.receive") &&
    principal.roleCodes.includes("PROJECT_MANAGER") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const postedCount = workspace.goodsReceipts.filter(
    ({ status }) => status === "POSTED",
  ).length;
  const draftCount = workspace.goodsReceipts.filter(
    ({ status }) =>
      status === "DRAFT" ||
      status === "PHYSICALLY_VERIFIED" ||
      status === "PENDING_PM_APPROVAL",
  ).length;
  const openExceptionCount = workspace.exceptions.filter(
    ({ status }) => status !== "RESOLVED" && status !== "RETURNED",
  ).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Phase 5 · goods receiving & stock ledger"
        title="Inventory and receiving"
        description="Create, verify, and approve receipts against issued purchase orders; stock changes only after PM approval."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent>
            <Warehouse className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Active locations</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {workspace.locations.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <PackageCheck className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Receivable POs</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {workspace.purchaseOrders.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <ClipboardCheck className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">GRN drafts</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {draftCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Boxes className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Posted GRNs</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {postedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <AlertTriangle className="size-5 text-amber-700" />
            <p className="mt-3 text-sm text-slate-500">Open exceptions</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {openExceptionCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {canCreateGrn && workspace.purchaseOrders.length ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Receive material
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Issued purchase orders are available. The Purchase Manager creates
              the draft; stock changes only after Store Keeper verification and
              Project Manager approval.
            </p>
          </CardHeader>
          <CardContent>
            <GoodsReceiptForm
              purchaseOrders={workspace.purchaseOrders}
              locations={workspace.locations}
            />
          </CardContent>
        </Card>
      ) : canCreateGrn ? (
        <ApplicationState
          kind="empty"
          title="No purchase orders ready to receive"
          description="A Purchase Manager must issue the PO before a GRN can be created."
        />
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Goods receipt register
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Draft, posted, and cancelled GRNs in your inventory workspace
          </p>
        </div>
        {workspace.goodsReceipts.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {workspace.goodsReceipts.map((receipt) => (
              <Card key={receipt.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        {receipt.grnNumber}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                        {receipt.poNumber}
                      </h3>
                    </div>
                    <StatusBadge
                      status={
                        receipt.status === "POSTED"
                          ? "Posted"
                          : receipt.status === "CANCELLED"
                            ? "Cancelled"
                            : receipt.status === "PENDING_PM_APPROVAL" ||
                                receipt.status === "PHYSICALLY_VERIFIED"
                              ? "Pending"
                              : "Draft"
                      }
                    />
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>
                      {receipt.location.locationCode} · {receipt.location.name}
                    </p>
                    <p>
                      Accepted {receipt.totals.accepted} · Damaged{" "}
                      {receipt.totals.damaged} · Rejected{" "}
                      {receipt.totals.rejected}
                    </p>
                    <p className="text-xs text-slate-500">
                      Created by {receipt.createdBy}
                      {receipt.postedBy
                        ? ` · Posted by ${receipt.postedBy}`
                        : ""}
                    </p>
                  </div>
                  {receipt.status === "DRAFT" &&
                  (canCreateGrn || canVerifyGrn) ? (
                    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                      {canVerifyGrn ? (
                        <GrnPostButton
                          goodsReceiptId={receipt.id}
                          mode="verify"
                        />
                      ) : null}
                      {canCreateGrn ? (
                        <GrnDraftControls
                          receipt={receipt}
                          locations={workspace.locations}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {receipt.status === "PENDING_PM_APPROVAL" && canApproveGrn ? (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <GrnPostButton
                        goodsReceiptId={receipt.id}
                        mode="approve"
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <ApplicationState
            kind="empty"
            title="No goods receipts yet"
            description="Create a GRN after an issued PO reaches a controlled store or site store."
          />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Stock transaction ledger
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Append-only receipt entries; corrections require a linked reversal.
          </p>
        </div>
        {workspace.stockTransactions.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workspace.stockTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">
                        {transaction.transactionNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {transaction.type}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {transaction.location.name}
                      <p className="text-xs text-slate-500">
                        {transaction.location.locationCode}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {transaction.material.name}
                      <p className="text-xs text-slate-500">
                        {transaction.material.materialCode}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {transaction.quantity} {transaction.unit.symbol}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {transaction.createdBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ApplicationState
            kind="empty"
            title="No ledger entries yet"
            description="Posted accepted quantities will appear as immutable receipt transactions."
          />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Damaged and rejected material
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track replacement, return, evidence, and resolution without adding
            non-conforming material to usable stock.
          </p>
        </div>
        {workspace.exceptions.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {workspace.exceptions.map((exception) => (
              <Card key={exception.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                        {exception.grnNumber} · {exception.type}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                        {exception.materialName}
                      </h3>
                    </div>
                    <StatusBadge
                      status={exceptionStatusLabel(exception.status)}
                    />
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>
                      {exception.poNumber} · {exception.locationName}
                    </p>
                    <p>
                      {exception.quantity} {exception.unitSymbol} ·{" "}
                      {exception.reason ?? "No reason recorded"}
                    </p>
                  </div>
                  {canVerifyGrn ? (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <GrnExceptionControls exception={exception} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <ApplicationState
            kind="empty"
            title="No damaged or rejected material"
            description="Exceptions will appear automatically when a posted GRN records damaged or rejected quantities."
          />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Current stock
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Calculated from the immutable stock transaction ledger
          </p>
        </div>
        {workspace.stockBalances.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Quantity on hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workspace.stockBalances.map((balance) => (
                  <tr key={`${balance.locationId}-${balance.materialId}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {balance.locationName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {balance.locationCode}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {balance.materialName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {balance.materialCode}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {balance.quantityOnHand} {balance.unitSymbol}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ApplicationState
            kind="empty"
            title="No posted stock yet"
            description="Stock will appear here after accepted GRN quantities are posted."
          />
        )}
      </section>
    </div>
  );
}
