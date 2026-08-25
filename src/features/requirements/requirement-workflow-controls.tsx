"use client";

import { useActionState } from "react";
import { Check, RotateCcw, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  decideRequirementAction,
  submitRequirementAction,
} from "@/features/requirements/requirement-actions";

export function RequirementWorkflowControls({
  requirementId,
  canSubmit,
  canDecide,
}: {
  requirementId: string;
  canSubmit: boolean;
  canDecide: boolean;
}) {
  const [submitState, submitAction, submitting] = useActionState(
    submitRequirementAction,
    null,
  );
  const [decisionState, decisionAction, deciding] = useActionState(
    decideRequirementAction,
    null,
  );
  const decisionFields =
    decisionState && !decisionState.ok ? decisionState.error.fields : undefined;

  if (canSubmit) {
    return (
      <form action={submitAction} className="space-y-3">
        <input type="hidden" name="requirementId" value={requirementId} />
        <Button type="submit" disabled={submitting}>
          <Send className="size-4" />
          {submitting ? "Submitting..." : "Submit for approval"}
        </Button>
        <p className="text-xs text-slate-500">
          Submission locks the draft until an authorized approver sends it back.
        </p>
        <FormFeedback state={submitState} success="Requirement submitted." />
      </form>
    );
  }

  if (canDecide) {
    return (
      <form action={decisionAction} className="space-y-4">
        <input type="hidden" name="requirementId" value={requirementId} />
        <Field
          label="Decision reason"
          htmlFor={`requirement-decision-reason-${requirementId}`}
          error={decisionFields?.reason?.[0]}
          hint="Required when rejecting or sending the requirement back."
        >
          <Textarea
            id={`requirement-decision-reason-${requirementId}`}
            name="reason"
            maxLength={1_000}
            placeholder="Add clear guidance for the requester"
            aria-invalid={Boolean(decisionFields?.reason)}
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            name="decision"
            value="APPROVE"
            disabled={deciding}
          >
            <Check className="size-4" />
            Approve
          </Button>
          <Button
            type="submit"
            name="decision"
            value="SEND_BACK"
            variant="secondary"
            disabled={deciding}
          >
            <RotateCcw className="size-4" />
            Send back
          </Button>
          <Button
            type="submit"
            name="decision"
            value="REJECT"
            variant="destructive"
            disabled={deciding}
          >
            <X className="size-4" />
            Reject
          </Button>
        </div>
        <FormFeedback state={decisionState} success="Decision recorded." />
      </form>
    );
  }

  return null;
}
