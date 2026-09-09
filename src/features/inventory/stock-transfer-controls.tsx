"use client";

import { useActionState } from "react";
import { PackageCheck, Send, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  cancelStockTransferDraftAction,
  dispatchStockTransferAction,
  receiveStockTransferAction,
  type StockTransferActionState,
} from "@/features/inventory/stock-transfer-actions";

export function StockTransferControls({
  stockTransferId,
  status,
  canManage,
  canReceive,
}: {
  stockTransferId: string;
  status: string;
  canManage: boolean;
  canReceive: boolean;
}) {
  const [dispatchState, dispatchAction, dispatchPending] = useActionState<
    StockTransferActionState,
    FormData
  >(dispatchStockTransferAction, null);
  const [cancelState, cancelAction, cancelPending] = useActionState<
    StockTransferActionState,
    FormData
  >(cancelStockTransferDraftAction, null);
  const [receiveState, receiveAction, receivePending] = useActionState<
    StockTransferActionState,
    FormData
  >(receiveStockTransferAction, null);

  if (status === "DRAFT" && canManage) {
    return (
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <form action={dispatchAction} className="space-y-2">
          <input type="hidden" name="stockTransferId" value={stockTransferId} />
          <Button type="submit" disabled={dispatchPending}>
            <Send className="size-4" />
            {dispatchPending ? "Dispatching..." : "Dispatch transfer"}
          </Button>
          <FormFeedback state={dispatchState} success="Transfer dispatched." />
        </form>
        <form action={cancelAction} className="space-y-2">
          <input type="hidden" name="stockTransferId" value={stockTransferId} />
          <Field
            label="Cancellation reason"
            htmlFor={`transfer-cancel-${stockTransferId}`}
          >
            <Input
              id={`transfer-cancel-${stockTransferId}`}
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={cancelPending}>
            <XCircle className="size-4" />
            {cancelPending ? "Cancelling..." : "Cancel transfer"}
          </Button>
          <FormFeedback
            state={cancelState}
            success="Transfer draft cancelled."
          />
        </form>
      </div>
    );
  }

  if (status === "DISPATCHED" && canReceive) {
    return (
      <form
        action={receiveAction}
        className="mt-4 space-y-2 border-t border-slate-100 pt-4"
      >
        <input type="hidden" name="stockTransferId" value={stockTransferId} />
        <Button type="submit" disabled={receivePending}>
          <PackageCheck className="size-4" />
          {receivePending ? "Receiving..." : "Receive at destination"}
        </Button>
        <FormFeedback
          state={receiveState}
          success="Transfer received at destination."
        />
      </form>
    );
  }

  return null;
}
