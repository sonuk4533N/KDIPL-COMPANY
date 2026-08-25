import {
  ArrowLeft,
  CalendarDays,
  FileCheck2,
  History,
  MapPin,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RfqDetail } from "@/features/procurement/rfq-queries";
import {
  CancelRfqForm,
  IssueRfqForm,
  QuotationCaptureForm,
  RecommendationForm,
  RfqDecisionForm,
} from "@/features/procurement/rfq-workflow-forms";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

export function RfqDetailView({ detail }: { detail: RfqDetail }) {
  const { rfq } = detail;
  const capabilities = rfq.capabilities;
  const recommended = rfq.quotations.find(
    ({ id }) => id === rfq.recommendedQuotationId,
  );
  return (
    <div className="space-y-7">
      <ButtonLink href="/procurement" variant="tertiary" className="px-0">
        <ArrowLeft className="size-4" /> Back to procurement
      </ButtonLink>
      <PageHeader
        eyebrow={rfq.rfqNumber}
        title={rfq.requirement.purpose}
        description={`${rfq.requirement.project.name} · ${rfq.requirement.site.name}`}
        action={<StatusBadge status={rfq.statusLabel} />}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent>
            <MapPin className="size-5 text-blue-700" />
            <p className="mt-3 text-xs text-slate-500">Requirement</p>
            <p className="mt-1 font-semibold">
              {rfq.requirement.requirementNumber}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CalendarDays className="size-5 text-blue-700" />
            <p className="mt-3 text-xs text-slate-500">
              Supplier responses due
            </p>
            <p className="mt-1 font-semibold">{rfq.responseDueDate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <FileCheck2 className="size-5 text-blue-700" />
            <p className="mt-3 text-xs text-slate-500">Quotations received</p>
            <p className="mt-1 font-display text-2xl font-extrabold">
              {rfq.quotations.length} / {rfq.invitedSuppliers.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {rfq.purchaseOrder ? (
        <Alert variant="success">
          <div>
            <p className="font-semibold">
              Draft purchase order {rfq.purchaseOrder.poNumber} created
            </p>
            <p className="mt-1">
              {rfq.purchaseOrder.supplier.tradeName ??
                rfq.purchaseOrder.supplier.legalName}{" "}
              · {inr.format(Number(rfq.purchaseOrder.totalAmount))} · delivery{" "}
              {rfq.purchaseOrder.expectedDeliveryDate}
            </p>
          </div>
        </Alert>
      ) : null}

      {capabilities.canIssue || capabilities.canDecide ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold">Required action</h2>
          </CardHeader>
          <CardContent>
            {capabilities.canIssue ? <IssueRfqForm rfqId={rfq.id} /> : null}
            {capabilities.canDecide ? <RfqDecisionForm rfqId={rfq.id} /> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg font-bold">
            Approved material scope
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            RFQ and quotation quantities come from this immutable approved
            requirement.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {rfq.requirement.lines.map((line) => (
            <div
              key={line.id}
              className="flex justify-between gap-4 rounded-lg border border-slate-200 p-3 text-sm"
            >
              <span>
                <strong>{line.material.name}</strong>
                <span className="ml-2 text-slate-500">
                  {line.material.materialCode}
                </span>
              </span>
              <span className="font-semibold">
                {line.quantity} {line.unit.symbol}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {capabilities.canRecordQuotation ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold">
              Record supplier quotation
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              The server calculates line subtotals, GST, freight, and landed
              total.
            </p>
          </CardHeader>
          <CardContent>
            <QuotationCaptureForm rfq={rfq} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="font-display text-lg font-bold">
            Quotation comparison
          </h2>
        </CardHeader>
        <CardContent>
          {rfq.quotations.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Reference</th>
                    <th className="p-3">Subtotal</th>
                    <th className="p-3">GST</th>
                    <th className="p-3">Freight</th>
                    <th className="p-3">Landed total</th>
                    <th className="p-3">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.quotations.map((quote) => (
                    <tr
                      key={quote.id}
                      className={
                        quote.id === rfq.recommendedQuotationId
                          ? "bg-amber-50"
                          : "border-b border-slate-100"
                      }
                    >
                      <td className="p-3 font-semibold">
                        {quote.supplier.tradeName ?? quote.supplier.legalName}
                      </td>
                      <td className="p-3">
                        <span>{quote.quoteReference}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          Evidence: {quote.documents[0]?.fileRecord.filename}
                        </span>
                      </td>
                      <td className="p-3">
                        {inr.format(Number(quote.subtotal))}
                      </td>
                      <td className="p-3">
                        {quote.gstRate}% · {inr.format(Number(quote.gstAmount))}
                      </td>
                      <td className="p-3">
                        {inr.format(Number(quote.freightAmount))}
                      </td>
                      <td className="p-3 font-bold">
                        {inr.format(Number(quote.landedTotal))}
                      </td>
                      <td className="p-3">{quote.offeredDeliveryDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No supplier quotations recorded.
            </p>
          )}
          {recommended ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Recommended:</strong>{" "}
              {recommended.supplier.tradeName ?? recommended.supplier.legalName}
              . {rfq.recommendationReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {capabilities.canRecommend ? (
        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-bold">
              Recommend supplier
            </h2>
          </CardHeader>
          <CardContent>
            <RecommendationForm rfq={rfq} />
          </CardContent>
        </Card>
      ) : null}
      {capabilities.canCancel ? (
        <Card>
          <CardContent>
            <CancelRfqForm rfqId={rfq.id} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <History className="size-5 text-blue-700" />
            Workflow history
          </h2>
        </CardHeader>
        <CardContent>
          {rfq.workflowEvents.length ? (
            <ol className="space-y-4">
              {rfq.workflowEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-blue-200 pl-4">
                  <p className="font-semibold">
                    {event.action.replace("_", " ")} by{" "}
                    {event.actorUser.displayName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.fromStatusLabel} → {event.toStatusLabel} ·{" "}
                    {new Date(event.createdAt).toLocaleString("en-IN")}
                  </p>
                  {event.reason ? (
                    <p className="mt-1 text-sm text-slate-700">
                      {event.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">No workflow events yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
