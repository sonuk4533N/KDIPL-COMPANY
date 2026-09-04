"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import { updateGoodsReceiptExceptionAction } from "@/features/inventory/inventory-completion-actions";
import type { InventoryWorkspace } from "@/features/inventory/inventory-queries";

export function GrnExceptionControls({
  exception,
}: {
  exception: InventoryWorkspace["exceptions"][number];
}) {
  const [state, action, pending] = useActionState(
    updateGoodsReceiptExceptionAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="exceptionId" value={exception.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Exception status" htmlFor={`exception-status-${exception.id}`}>
          <Select
            id={`exception-status-${exception.id}`}
            name="status"
            defaultValue={exception.status}
            required
          >
            <option value="OPEN">Open</option>
            <option value="REPLACEMENT_EXPECTED">Replacement expected</option>
            <option value="RETURN_PENDING">Return pending</option>
            <option value="RETURNED">Returned</option>
            <option value="RESOLVED">Resolved</option>
          </Select>
        </Field>
        <Field label="Evidence reference" htmlFor={`exception-evidence-${exception.id}`}>
          <Input
            id={`exception-evidence-${exception.id}`}
            name="evidenceReference"
            defaultValue={exception.evidenceReference ?? ""}
            maxLength={500}
            placeholder="Photo/document/return challan reference"
          />
        </Field>
      </div>
      <Field label="Resolution notes" htmlFor={`exception-notes-${exception.id}`}>
        <Textarea
          id={`exception-notes-${exception.id}`}
          name="resolutionNotes"
          defaultValue={exception.resolutionNotes ?? ""}
          maxLength={1000}
          placeholder="Replacement, return, supplier confirmation, or resolution details"
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Updating exception..." : "Update exception"}
      </Button>
      <FormFeedback state={state} success="Receipt exception updated." />
    </form>
  );
}
