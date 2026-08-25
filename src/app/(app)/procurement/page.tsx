import {
  CalendarDays,
  ClipboardList,
  FileText,
  LockKeyhole,
  MapPin,
  Store,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApplicationState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { RfqDraftForm } from "@/features/procurement/rfq-form";
import { getProcurementWorkspace } from "@/features/procurement/rfq-queries";
import { getCurrentPrincipal } from "@/server/auth/current-user";
import { hasPermission } from "@/server/authorization/authorization";

export default async function ProcurementPage() {
  const principal = await getCurrentPrincipal();
  if (!principal || !hasPermission(principal, "purchase.view")) {
    return (
      <ApplicationState
        kind="forbidden"
        title="Procurement access required"
        description="You need purchase visibility to open the sourcing workspace."
      />
    );
  }
  const workspace = await getProcurementWorkspace(principal);
  const canCreate = hasPermission(principal, "purchase.create");
  const supplierInvitationCount = workspace.rfqs.reduce(
    (total, rfq) => total + rfq.invitedSuppliers.length,
    0,
  );
  const purchaseOrders = workspace.rfqs.flatMap((rfq) =>
    rfq.purchaseOrder ? [{ ...rfq.purchaseOrder, rfq }] : [],
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Phase 4 · commercial sourcing"
        title="Procurement sourcing"
        description="Issue RFQs, compare documented supplier quotations, route recommendations for independent approval, and create controlled draft purchase orders."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <ClipboardList className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Approved requirements</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {workspace.requirements.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <FileText className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">RFQs</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {workspace.rfqs.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Store className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Supplier invitations</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {supplierInvitationCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <FileText className="size-5 text-blue-700" />
            <p className="mt-3 text-sm text-slate-500">Draft purchase orders</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">
              {purchaseOrders.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Alert variant="success">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <LockKeyhole className="size-4" />
            Controlled commercial workflow
          </p>
          <p className="mt-1">
            Purchase Managers issue and recommend; an independent Project
            Director approves or rejects. Approval creates a draft PO only.
          </p>
        </div>
      </Alert>

      {canCreate &&
      workspace.requirements.length &&
      workspace.suppliers.length ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Create RFQ draft
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Material scope is read directly from the approved requirement and
              recorded in the audit event.
            </p>
          </CardHeader>
          <CardContent>
            <RfqDraftForm
              requirements={workspace.requirements}
              suppliers={workspace.suppliers}
            />
          </CardContent>
        </Card>
      ) : canCreate ? (
        <ApplicationState
          kind="empty"
          title="RFQ prerequisites are missing"
          description="Approve a material requirement and keep at least one supplier active before creating an RFQ draft."
        />
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            RFQ register
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {workspace.rfqs.length} RFQs visible in your sourcing scope
          </p>
        </div>
        {workspace.rfqs.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {workspace.rfqs.map((rfq) => (
              <Card key={rfq.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        {rfq.rfqNumber}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                        {rfq.requirement.purpose}
                      </h3>
                    </div>
                    <StatusBadge status={rfq.statusLabel} />
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>
                      {rfq.requirement.requirementNumber} ·{" "}
                      {rfq.requirement.project.name}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="size-4 text-slate-400" />
                      {rfq.requirement.site.name}
                    </p>
                    <p className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-slate-400" />
                      Responses due {rfq.responseDueDate}
                    </p>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Invited suppliers
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {rfq.invitedSuppliers
                        .map(
                          ({ supplier }) =>
                            supplier.tradeName ?? supplier.legalName,
                        )
                        .join(", ")}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Created by {rfq.createdBy.displayName}
                    </p>
                    <ButtonLink
                      href={`/procurement/rfqs/${rfq.id}`}
                      variant="secondary"
                      className="mt-4"
                    >
                      Open RFQ
                    </ButtonLink>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <ApplicationState
            kind="empty"
            title="No RFQ drafts yet"
            description="Approved requirements are ready to enter the draft sourcing workspace."
          />
        )}
      </section>

      {purchaseOrders.length ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Draft purchase order register
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Generated only from approved supplier recommendations
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {purchaseOrders.map((purchaseOrder) => (
              <Card key={purchaseOrder.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        {purchaseOrder.poNumber}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-bold text-slate-950">
                        {purchaseOrder.supplier.tradeName ??
                          purchaseOrder.supplier.legalName}
                      </h3>
                    </div>
                    <StatusBadge status="Draft" />
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {purchaseOrder.rfq.rfqNumber} · expected delivery{" "}
                    {purchaseOrder.expectedDeliveryDate}
                  </p>
                  <p className="mt-2 font-semibold text-slate-950">
                    INR {purchaseOrder.totalAmount}
                  </p>
                  <ButtonLink
                    href={`/procurement/rfqs/${purchaseOrder.rfq.id}`}
                    variant="secondary"
                    className="mt-4"
                  >
                    Open source RFQ
                  </ButtonLink>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
