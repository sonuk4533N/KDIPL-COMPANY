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
import { MaterialIssueControls } from "@/features/inventory/material-issue-controls";
import { MaterialIssueForm } from "@/features/inventory/material-issue-form";
import { StockTransferControls } from "@/features/inventory/stock-transfer-controls";
import { StockTransferForm } from "@/features/inventory/stock-transfer-form";
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

function materialIssueStatusLabel(status: string): StandardStatus {
  const labels: Record<string, StandardStatus> = {
    DRAFT: "Draft",
    POSTED: "Posted",
    ACKNOWLEDGED: "Acknowledged",
    CANCELLED: "Cancelled",
  };
  return labels[status] ?? "Draft";
}

function stockTransferStatusLabel(status: string): StandardStatus {
  const labels: Record<string, StandardStatus> = {
    DRAFT: "Draft",
    DISPATCHED: "Dispatched",
    RECEIVED: "Received",
    CANCELLED: "Cancelled",
  };
  return labels[status] ?? "Draft";
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
  const canReceive =
    hasPermission(principal, "inventory.receive") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") &&
    (principal.roleCodes.includes("STORE_KEEPER") ||
      principal.roleCodes.includes("SITE_SUPERVISOR"));
  const canManageIssues =
    hasPermission(principal, "inventory.issue") &&
    principal.roleCodes.includes("STORE_KEEPER") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const canAcknowledgeIssues =
    hasPermission(principal, "inventory.issue") &&
    principal.roleCodes.includes("SITE_SUPERVISOR") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const canManageTransfers =
    hasPermission(principal, "inventory.transfer") &&
    principal.roleCodes.includes("STORE_KEEPER") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR");
  const canReceiveTransfers =
    hasPermission(principal, "inventory.transfer") &&
    !principal.roleCodes.includes("SYSTEM_ADMINISTRATOR") &&
    (principal.roleCodes.includes("STORE_KEEPER") ||
      principal.roleCodes.includes("SITE_SUPERVISOR"));
  const postedCount = workspace.goodsReceipts.filter(
    ({ status }) => status === "POSTED",
  ).length;
  const draftCount = workspace.goodsReceipts.filter(
    ({ status }) => status === "DRAFT",
  ).length;
  const openExceptionCount = workspace.exceptions.filter(
    ({ status }) => status !== "RESOLVED" && status !== "RETURNED",
  ).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Phase 6 · receiving, issues & stock transfers"
        title="Inventory and receiving"
        description="Receive supplier material, issue or transfer available stock, and keep every location balance derived from immutable ledger transactions."
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

      {canManageIssues &&
      workspace.stockBalances.some(
        ({ quantityOnHand }) => Number(quantityOnHand) > 0,
      ) &&
      workspace.issueDestinations.length ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Issue material to site
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select currently available stock and an active destination site.
              Stock leaves the source only after posting.
            </p>
          </CardHeader>
          <CardContent>
            <MaterialIssueForm
              balances={workspace.stockBalances}
              destinations={workspace.issueDestinations}
            />
          </CardContent>
        </Card>
      ) : canManageIssues ? (
        <ApplicationState
          kind="empty"
          title="No stock available to issue"
          description="Post accepted inventory into an active location and ensure an active destination site exists before creating an issue."
        />
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Material issue register
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Drafts, posted stock-outs, and destination-site acknowledgments
            within your assigned inventory scope
          </p>
        </div>
        {workspace.materialIssues.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {workspace.materialIssues.map((issue) => (
              <Card key={issue.id} data-testid={`material-issue-${issue.id}`}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        {issue.issueNumber}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                        {issue.site?.name ?? issue.project.name}
                      </h3>
                    </div>
                    <StatusBadge
                      status={materialIssueStatusLabel(issue.status)}
                    />
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>
                      From {issue.sourceLocation.locationCode} ·{" "}
                      {issue.sourceLocation.name}
                    </p>
                    <p>
                      To {issue.project.projectCode}
                      {issue.site ? ` · ${issue.site.siteCode}` : ""}
                    </p>
                    {issue.lines.map((line) => (
                      <p key={line.id} className="font-semibold text-slate-900">
                        {line.material.materialCode} · {line.material.name} ·{" "}
                        {line.quantity} {line.unit.symbol}
                      </p>
                    ))}
                    <p>{issue.purpose}</p>
                    <p className="text-xs text-slate-500">
                      Created by {issue.createdBy}
                      {issue.postedBy ? ` · Posted by ${issue.postedBy}` : ""}
                      {issue.acknowledgedBy
                        ? ` · Acknowledged by ${issue.acknowledgedBy}`
                        : ""}
                    </p>
                  </div>
                  <MaterialIssueControls
                    materialIssueId={issue.id}
                    status={issue.status}
                    canManage={canManageIssues}
                    canAcknowledge={canAcknowledgeIssues}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <ApplicationState
            kind="empty"
            title="No material issues yet"
            description="Create a draft from available stock, post it, and let the assigned Site Supervisor acknowledge receipt."
          />
        )}
      </section>

      {canManageTransfers &&
      workspace.stockBalances.some(
        ({ quantityOnHand }) => Number(quantityOnHand) > 0,
      ) &&
      workspace.locations.length > 1 ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Transfer stock between locations
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Dispatch records stock out at the source. Stock stays in transit
              until an authorized destination receiver accepts it.
            </p>
          </CardHeader>
          <CardContent>
            <StockTransferForm
              balances={workspace.stockBalances}
              locations={workspace.locations}
            />
          </CardContent>
        </Card>
      ) : canManageTransfers ? (
        <ApplicationState
          kind="empty"
          title="No stock available to transfer"
          description="At least two active inventory locations and a positive source balance are required."
        />
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Stock transfer register
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Draft, in-transit, received, and cancelled transfers within your
            inventory scope
          </p>
        </div>
        {workspace.stockTransfers.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {workspace.stockTransfers.map((transfer) => (
              <Card
                key={transfer.id}
                data-testid={`stock-transfer-${transfer.id}`}
              >
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        {transfer.transferNumber}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                        {transfer.sourceLocation.locationCode} →{" "}
                        {transfer.destinationLocation.locationCode}
                      </h3>
                    </div>
                    <StatusBadge
                      status={stockTransferStatusLabel(transfer.status)}
                    />
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>
                      From {transfer.sourceLocation.name} · To{" "}
                      {transfer.destinationLocation.name}
                    </p>
                    {transfer.lines.map((line) => (
                      <p key={line.id} className="font-semibold text-slate-900">
                        {line.material.materialCode} · {line.material.name} ·{" "}
                        {line.quantity} {line.unit.symbol}
                      </p>
                    ))}
                    <p>
                      {transfer.purpose === "PROJECT_CLOSE"
                        ? "Project-close disposition"
                        : "Routine transfer"}
                    </p>
                    {transfer.notes ? <p>{transfer.notes}</p> : null}
                    <p className="text-xs text-slate-500">
                      Created by {transfer.createdBy}
                      {transfer.dispatchedBy
                        ? ` · Dispatched by ${transfer.dispatchedBy}`
                        : ""}
                      {transfer.receivedBy
                        ? ` · Received by ${transfer.receivedBy}`
                        : ""}
                    </p>
                  </div>
                  <StockTransferControls
                    stockTransferId={transfer.id}
                    status={transfer.status}
                    canManage={canManageTransfers}
                    canReceive={canReceiveTransfers}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <ApplicationState
            kind="empty"
            title="No stock transfers yet"
            description="Create a draft, dispatch it from the source, and receive it at the destination."
          />
        )}
      </section>

      {canReceive && workspace.purchaseOrders.length ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Receive material
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Only supplier-accepted purchase orders are available. Accepted
              quantity enters usable stock only after posting.
            </p>
          </CardHeader>
          <CardContent>
            <GoodsReceiptForm
              purchaseOrders={workspace.purchaseOrders}
              locations={workspace.locations}
            />
          </CardContent>
        </Card>
      ) : canReceive ? (
        <ApplicationState
          kind="empty"
          title="No purchase orders ready to receive"
          description="A Purchase Manager must issue the PO and record supplier acceptance before a GRN can be created."
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
                  {canReceive && receipt.status === "DRAFT" ? (
                    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                      <GrnPostButton goodsReceiptId={receipt.id} />
                      <GrnDraftControls
                        receipt={receipt}
                        locations={workspace.locations}
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
            description="Create a GRN when supplier-accepted material reaches a controlled store or site store."
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
                  {canReceive ? (
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
