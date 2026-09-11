"use client";

import { useActionState } from "react";
import { CheckCircle2, Send, SlidersHorizontal, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  cancelStockAdjustmentAction,
  decideStockAdjustmentAction,
  postStockAdjustmentAction,
  submitStockAdjustmentAction,
  type StockAdjustmentActionState,
} from "@/features/inventory/stock-adjustment-actions";

function CancelForm({ stockAdjustmentId }: { stockAdjustmentId: string }) {
  const [state, action, pending] = useActionState<
    StockAdjustmentActionState,
    FormData
  >(cancelStockAdjustmentAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="stockAdjustmentId" value={stockAdjustmentId} />
      <Field
        label="Cancellation reason"
        htmlFor={`adjustment-cancel-${stockAdjustmentId}`}
      >
        <Input
          id={`adjustment-cancel-${stockAdjustmentId}`}
          name="reason"
          minLength={3}
          maxLength={1000}
          required
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        <XCircle className="size-4" />
        {pending ? "Cancelling..." : "Cancel adjustment"}
      </Button>
      <FormFeedback state={state} success="Stock adjustment cancelled." />
    </form>
  );
}

export function StockAdjustmentControls({
  stockAdjustmentId,
  status,
  canManage,
  canDecide,
}: {
  stockAdjustmentId: string;
  status: string;
  canManage: boolean;
  canDecide: boolean;
}) {
  const [submitState, submitAction, submitPending] = useActionState<
    StockAdjustmentActionState,
    FormData
  >(submitStockAdjustmentAction, null);
  const [decisionState, decisionAction, decisionPending] = useActionState<
    StockAdjustmentActionState,
    FormData
  >(decideStockAdjustmentAction, null);
  const [postState, postAction, postPending] = useActionState<
    StockAdjustmentActionState,
    FormData
  >(postStockAdjustmentAction, null);

  if (status === "DRAFT" && canManage) {
    return (
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <form action={submitAction} className="space-y-2">
          <input
            type="hidden"
            name="stockAdjustmentId"
            value={stockAdjustmentId}
          />
          <Button type="submit" disabled={submitPending}>
            <Send className="size-4" />
            {submitPending ? "Submitting..." : "Submit for approval"}
          </Button>
          <FormFeedback
            state={submitState}
            success="Adjustment submitted for approval."
          />
        </form>
        <CancelForm stockAdjustmentId={stockAdjustmentId} />
      </div>
    );
  }

  if (status === "SUBMITTED" && canDecide) {
    return (
      <form
        action={decisionAction}
        className="mt-4 space-y-3 border-t border-slate-100 pt-4"
      >
        <input
          type="hidden"
          name="stockAdjustmentId"
          value={stockAdjustmentId}
        />
        <Field
          label="Decision notes"
          htmlFor={`adjustment-decision-${stockAdjustmentId}`}
        >
          <Textarea
            id={`adjustment-decision-${stockAdjustmentId}`}
            name="notes"
            minLength={3}
            maxLength={1000}
            required
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            name="decision"
            value="APPROVE"
            type="submit"
            disabled={decisionPending}
          >
            <CheckCircle2 className="size-4" />
            Approve adjustment
          </Button>
          <Button
            name="decision"
            value="REJECT"
            type="submit"
            variant="destructive"
            disabled={decisionPending}
          >
            <XCircle className="size-4" />
            Reject adjustment
          </Button>
        </div>
        <FormFeedback
          state={decisionState}
          success="Adjustment decision recorded."
        />
      </form>
    );
  }

  if (status === "APPROVED" && canManage) {
    return (
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <form action={postAction} className="space-y-2">
          <input
            type="hidden"
            name="stockAdjustmentId"
            value={stockAdjustmentId}
          />
          <Button type="submit" disabled={postPending}>
            <SlidersHorizontal className="size-4" />
            {postPending ? "Posting..." : "Post approved adjustment"}
          </Button>
          <FormFeedback
            state={postState}
            success="Approved stock adjustment posted."
          />
        </form>
        <CancelForm stockAdjustmentId={stockAdjustmentId} />
      </div>
    );
  }

  return null;
}
