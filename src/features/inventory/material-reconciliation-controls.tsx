"use client";

import { useActionState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  cancelMaterialReconciliationAction,
  postMaterialReconciliationAction,
  type MaterialReconciliationActionState,
} from "@/features/inventory/material-reconciliation-actions";

export function MaterialReconciliationControls({
  materialReconciliationId,
  status,
  canManage,
}: {
  materialReconciliationId: string;
  status: string;
  canManage: boolean;
}) {
  const [postState, postAction, postPending] = useActionState<
    MaterialReconciliationActionState,
    FormData
  >(postMaterialReconciliationAction, null);
  const [cancelState, cancelAction, cancelPending] = useActionState<
    MaterialReconciliationActionState,
    FormData
  >(cancelMaterialReconciliationAction, null);

  if (status !== "DRAFT" || !canManage) return null;
  return (
    <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
      <form action={postAction} className="space-y-2">
        <input
          type="hidden"
          name="materialReconciliationId"
          value={materialReconciliationId}
        />
        <Button type="submit" disabled={postPending}>
          <CheckCircle2 className="size-4" />
          {postPending ? "Posting..." : "Post reconciliation"}
        </Button>
        <FormFeedback
          state={postState}
          success="Material reconciliation posted."
        />
      </form>
      <form action={cancelAction} className="space-y-2">
        <input
          type="hidden"
          name="materialReconciliationId"
          value={materialReconciliationId}
        />
        <Field
          label="Cancellation reason"
          htmlFor={`reconciliation-cancel-${materialReconciliationId}`}
        >
          <Input
            id={`reconciliation-cancel-${materialReconciliationId}`}
            name="reason"
            minLength={3}
            maxLength={1000}
            required
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={cancelPending}>
          <XCircle className="size-4" />
          {cancelPending ? "Cancelling..." : "Cancel reconciliation"}
        </Button>
        <FormFeedback
          state={cancelState}
          success="Material reconciliation cancelled."
        />
      </form>
    </div>
  );
}
