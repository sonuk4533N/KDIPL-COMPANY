"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  cancelPurchaseOrderAction,
  issuePurchaseOrderAction,
  recordSupplierAcceptanceAction,
  type InventoryActionState,
} from "@/features/inventory/inventory-actions";

function fieldsFor(state: InventoryActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function PurchaseOrderControls({
  purchaseOrderId,
  status,
}: {
  purchaseOrderId: string;
  status: string;
}) {
  const [issueState, issueAction, issuePending] = useActionState(
    issuePurchaseOrderAction,
    null,
  );
  const [acceptState, acceptAction, acceptPending] = useActionState(
    recordSupplierAcceptanceAction,
    null,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelPurchaseOrderAction,
    null,
  );
  const acceptanceFields = fieldsFor(acceptState);

  if (status === "DRAFT") {
    return (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <form action={issueAction} className="space-y-3">
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <Button type="submit" disabled={issuePending}>
            {issuePending ? "Issuing PO..." : "Issue purchase order"}
          </Button>
          <FormFeedback state={issueState} success="Purchase order issued." />
        </form>
      </div>
    );
  }

  if (status === "ISSUED") {
    return (
      <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
        <form action={acceptAction} className="space-y-3">
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Supplier accepted on"
              htmlFor={`supplier-accepted-${purchaseOrderId}`}
              error={acceptanceFields?.supplierAcceptedAt?.[0]}
            >
              <Input
                id={`supplier-accepted-${purchaseOrderId}`}
                name="supplierAcceptedAt"
                type="date"
                required
              />
            </Field>
            <Field
              label="Acceptance reference"
              htmlFor={`supplier-acceptance-reference-${purchaseOrderId}`}
              error={acceptanceFields?.supplierAcceptanceReference?.[0]}
            >
              <Input
                id={`supplier-acceptance-reference-${purchaseOrderId}`}
                name="supplierAcceptanceReference"
                maxLength={100}
                placeholder="Email / acknowledgement / reference"
                required
              />
            </Field>
          </div>
          <Button type="submit" disabled={acceptPending}>
            {acceptPending ? "Recording acceptance..." : "Record supplier acceptance"}
          </Button>
          <FormFeedback
            state={acceptState}
            success="Supplier acceptance recorded. PO is open for receiving."
          />
        </form>

        <form action={cancelAction} className="space-y-3">
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <Field label="Cancellation reason" htmlFor={`po-cancel-${purchaseOrderId}`}>
            <Input
              id={`po-cancel-${purchaseOrderId}`}
              name="reason"
              maxLength={1000}
              placeholder="Required reason"
              required
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={cancelPending}>
            {cancelPending ? "Cancelling..." : "Cancel PO"}
          </Button>
          <FormFeedback state={cancelState} success="Purchase order cancelled." />
        </form>
      </div>
    );
  }

  if (status === "ACCEPTED") {
    return (
      <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-emerald-700">
        Supplier accepted. Material can now be received through the Inventory workspace.
      </div>
    );
  }

  if (status === "PARTIALLY_RECEIVED") {
    return (
      <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-amber-700">
        Partially received. Remaining quantity stays open for additional GRNs.
      </div>
    );
  }

  if (status === "RECEIVED") {
    return (
      <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-emerald-700">
        Fully received. Close-out remains a separate controlled action.
      </div>
    );
  }

  return null;
}
