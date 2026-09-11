"use client";

import { useActionState } from "react";
import { CheckCircle2, ClipboardCheck, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  cancelStockCountAction,
  decideStockCountAction,
  postStockCountAction,
  submitStockCountAction,
  type StockCountActionState,
} from "@/features/inventory/stock-count-actions";

function CancelForm({ stockCountId }: { stockCountId: string }) {
  const [state, action, pending] = useActionState<
    StockCountActionState,
    FormData
  >(cancelStockCountAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="stockCountId" value={stockCountId} />
      <Field
        label="Cancellation reason"
        htmlFor={`count-cancel-${stockCountId}`}
      >
        <Input
          id={`count-cancel-${stockCountId}`}
          name="reason"
          minLength={3}
          maxLength={1000}
          required
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        <XCircle className="size-4" />
        {pending ? "Cancelling..." : "Cancel count"}
      </Button>
      <FormFeedback state={state} success="Physical count cancelled." />
    </form>
  );
}

export function StockCountControls({
  stockCountId,
  status,
  canManage,
  canDecide,
}: {
  stockCountId: string;
  status: string;
  canManage: boolean;
  canDecide: boolean;
}) {
  const [submitState, submitAction, submitPending] = useActionState<
    StockCountActionState,
    FormData
  >(submitStockCountAction, null);
  const [decisionState, decisionAction, decisionPending] = useActionState<
    StockCountActionState,
    FormData
  >(decideStockCountAction, null);
  const [postState, postAction, postPending] = useActionState<
    StockCountActionState,
    FormData
  >(postStockCountAction, null);
  if (status === "DRAFT" && canManage)
    return (
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <form action={submitAction} className="space-y-2">
          <input type="hidden" name="stockCountId" value={stockCountId} />
          <Button type="submit" disabled={submitPending}>
            <Send className="size-4" />
            {submitPending ? "Submitting..." : "Submit for approval"}
          </Button>
          <FormFeedback
            state={submitState}
            success="Count submitted for approval."
          />
        </form>
        <CancelForm stockCountId={stockCountId} />
      </div>
    );
  if (status === "SUBMITTED" && canDecide)
    return (
      <form
        action={decisionAction}
        className="mt-4 space-y-3 border-t border-slate-100 pt-4"
      >
        <input type="hidden" name="stockCountId" value={stockCountId} />
        <Field
          label="Decision notes"
          htmlFor={`count-decision-${stockCountId}`}
        >
          <Textarea
            id={`count-decision-${stockCountId}`}
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
            Approve count
          </Button>
          <Button
            name="decision"
            value="REJECT"
            type="submit"
            variant="destructive"
            disabled={decisionPending}
          >
            <XCircle className="size-4" />
            Reject count
          </Button>
        </div>
        <FormFeedback
          state={decisionState}
          success="Count decision recorded."
        />
      </form>
    );
  if (status === "APPROVED" && canManage)
    return (
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <form action={postAction} className="space-y-2">
          <input type="hidden" name="stockCountId" value={stockCountId} />
          <Button type="submit" disabled={postPending}>
            <ClipboardCheck className="size-4" />
            {postPending ? "Posting..." : "Post approved variance"}
          </Button>
          <FormFeedback
            state={postState}
            success="Approved count variance posted."
          />
        </form>
        <CancelForm stockCountId={stockCountId} />
      </div>
    );
  return null;
}
