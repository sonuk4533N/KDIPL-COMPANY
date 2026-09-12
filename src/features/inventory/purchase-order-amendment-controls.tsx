"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  createPurchaseOrderAmendmentAction,
  decidePurchaseOrderAmendmentAction,
} from "@/features/inventory/purchase-order-amendment-actions";
import type { ProcurementWorkspace } from "@/features/procurement/rfq-queries";

type PurchaseOrder = NonNullable<
  ProcurementWorkspace["rfqs"][number]["purchaseOrder"]
>;

export function PurchaseOrderAmendmentControls({
  purchaseOrder,
  canCreate,
  canApprove,
}: {
  purchaseOrder: PurchaseOrder;
  canCreate: boolean;
  canApprove: boolean;
}) {
  const [createState, createAction, createPending] = useActionState(
    createPurchaseOrderAmendmentAction,
    null,
  );
  const [decisionState, decisionAction, decisionPending] = useActionState(
    decidePurchaseOrderAmendmentAction,
    null,
  );
  const pendingAmendment = purchaseOrder.amendments.find(
    ({ status }) => status === "PENDING_APPROVAL",
  );
  const isOpen = ["ISSUED", "ACCEPTED", "PARTIALLY_RECEIVED"].includes(
    purchaseOrder.status,
  );

  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          PO amendment history
        </p>
        {purchaseOrder.amendments.length ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {purchaseOrder.amendments.map((amendment) => (
              <li key={amendment.id}>
                V{amendment.version} · {amendment.status} · {amendment.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">No amendments.</p>
        )}
      </div>

      {canCreate && isOpen && !pendingAmendment ? (
        <form action={createAction} className="space-y-3">
          <input
            type="hidden"
            name="purchaseOrderId"
            value={purchaseOrder.id}
          />
          <Field
            label="Amendment reason"
            htmlFor={`po-amend-reason-${purchaseOrder.id}`}
          >
            <Textarea
              id={`po-amend-reason-${purchaseOrder.id}`}
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Expected delivery"
              htmlFor={`po-amend-date-${purchaseOrder.id}`}
            >
              <Input
                id={`po-amend-date-${purchaseOrder.id}`}
                name="expectedDeliveryDate"
                type="date"
                defaultValue={purchaseOrder.expectedDeliveryDate}
                required
              />
            </Field>
            <Field
              label="Freight"
              htmlFor={`po-amend-freight-${purchaseOrder.id}`}
            >
              <Input
                id={`po-amend-freight-${purchaseOrder.id}`}
                name="freightAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={purchaseOrder.freightAmount}
                required
              />
            </Field>
          </div>
          <Field
            label="Payment terms"
            htmlFor={`po-amend-terms-${purchaseOrder.id}`}
          >
            <Textarea
              id={`po-amend-terms-${purchaseOrder.id}`}
              name="paymentTerms"
              maxLength={500}
              defaultValue={purchaseOrder.paymentTerms}
              required
            />
          </Field>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Quantity</th>
                  <th className="px-3 py-2">Unit price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseOrder.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">
                      <input
                        type="hidden"
                        name="purchaseOrderLineId"
                        value={line.id}
                      />
                      {line.requirementLine.material.name}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        name="quantity"
                        type="number"
                        min="0.001"
                        step="0.001"
                        defaultValue={line.quantity}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        name="unitPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={line.unitPrice}
                        required
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="submit" disabled={createPending}>
            {createPending ? "Submitting amendment..." : "Submit amendment"}
          </Button>
          <FormFeedback
            state={createState}
            success="PO amendment submitted to Project Director."
          />
        </form>
      ) : null}

      {pendingAmendment && canApprove ? (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-950">
            Amendment V{pendingAmendment.version} requires your decision.
          </p>
          <form action={decisionAction} className="flex flex-wrap gap-2">
            <input
              type="hidden"
              name="amendmentId"
              value={pendingAmendment.id}
            />
            <input type="hidden" name="decision" value="APPROVE" />
            <Input
              name="reason"
              maxLength={1000}
              placeholder="Approval note (optional)"
            />
            <Button type="submit" disabled={decisionPending}>
              Approve amendment
            </Button>
          </form>
          <form action={decisionAction} className="flex flex-wrap gap-2">
            <input
              type="hidden"
              name="amendmentId"
              value={pendingAmendment.id}
            />
            <input type="hidden" name="decision" value="REJECT" />
            <Input
              name="reason"
              minLength={3}
              maxLength={1000}
              placeholder="Rejection reason"
              required
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={decisionPending}
            >
              Reject amendment
            </Button>
          </form>
          <FormFeedback
            state={decisionState}
            success="Amendment decision recorded."
          />
        </div>
      ) : null}
    </div>
  );
}
