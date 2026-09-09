"use client";

import { useActionState } from "react";
import { BadgeCheck, PackageMinus, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  acknowledgeMaterialIssueAction,
  cancelMaterialIssueDraftAction,
  postMaterialIssueAction,
  type MaterialIssueActionState,
} from "@/features/inventory/material-issue-actions";

export function MaterialIssueControls({
  materialIssueId,
  status,
  canManage,
  canAcknowledge,
}: {
  materialIssueId: string;
  status: string;
  canManage: boolean;
  canAcknowledge: boolean;
}) {
  const [postState, postAction, postPending] = useActionState<
    MaterialIssueActionState,
    FormData
  >(postMaterialIssueAction, null);
  const [cancelState, cancelAction, cancelPending] = useActionState<
    MaterialIssueActionState,
    FormData
  >(cancelMaterialIssueDraftAction, null);
  const [acknowledgeState, acknowledgeAction, acknowledgePending] =
    useActionState<MaterialIssueActionState, FormData>(
      acknowledgeMaterialIssueAction,
      null,
    );

  if (status === "DRAFT" && canManage) {
    return (
      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <form action={postAction} className="space-y-2">
          <input type="hidden" name="materialIssueId" value={materialIssueId} />
          <Button type="submit" disabled={postPending}>
            <PackageMinus className="size-4" />
            {postPending ? "Posting issue..." : "Post material issue"}
          </Button>
          <FormFeedback state={postState} success="Material issued to site." />
        </form>
        <form action={cancelAction} className="space-y-2">
          <input type="hidden" name="materialIssueId" value={materialIssueId} />
          <Field
            label="Cancellation reason"
            htmlFor={`issue-cancel-${materialIssueId}`}
          >
            <Input
              id={`issue-cancel-${materialIssueId}`}
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={cancelPending}>
            <XCircle className="size-4" />
            {cancelPending ? "Cancelling..." : "Cancel draft"}
          </Button>
          <FormFeedback state={cancelState} success="Issue draft cancelled." />
        </form>
      </div>
    );
  }

  if (status === "POSTED" && canAcknowledge) {
    return (
      <form
        action={acknowledgeAction}
        className="mt-4 space-y-2 border-t border-slate-100 pt-4"
      >
        <input type="hidden" name="materialIssueId" value={materialIssueId} />
        <Button type="submit" disabled={acknowledgePending}>
          <BadgeCheck className="size-4" />
          {acknowledgePending ? "Acknowledging..." : "Acknowledge at site"}
        </Button>
        <FormFeedback
          state={acknowledgeState}
          success="Material issue acknowledged at site."
        />
      </form>
    );
  }

  return null;
}
