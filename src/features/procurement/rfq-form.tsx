"use client";

import { useActionState, useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { FormFeedback } from "@/components/ui/form-feedback";
import {
  saveRfqDraftAction,
  type RfqActionState,
} from "@/features/procurement/rfq-actions";
import type { ProcurementWorkspace } from "@/features/procurement/rfq-queries";

function fieldsFor(state: RfqActionState) {
  return state && !state.ok ? state.error.fields : undefined;
}

export function RfqDraftForm({
  requirements,
  suppliers,
}: {
  requirements: ProcurementWorkspace["requirements"];
  suppliers: ProcurementWorkspace["suppliers"];
}) {
  const [state, action, pending] = useActionState(saveRfqDraftAction, null);
  const [requirementId, setRequirementId] = useState("");
  const selectedRequirement = useMemo(
    () => requirements.find(({ id }) => id === requirementId),
    [requirementId, requirements],
  );
  const fields = fieldsFor(state);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Approved requirement"
          htmlFor="rfq-requirement"
          error={fields?.requirementId?.[0]}
        >
          <Select
            id="rfq-requirement"
            name="requirementId"
            value={requirementId}
            onChange={(event) => setRequirementId(event.target.value)}
            required
            aria-invalid={Boolean(fields?.requirementId)}
          >
            <option value="">Select approved requirement</option>
            {requirements.map((requirement) => (
              <option key={requirement.id} value={requirement.id}>
                {requirement.requirementNumber} · {requirement.project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Supplier response due"
          htmlFor="rfq-response-due"
          error={fields?.responseDueDate?.[0]}
          hint="This saves a draft only; no supplier communication is sent."
        >
          <Input
            id="rfq-response-due"
            name="responseDueDate"
            type="date"
            required
            aria-invalid={Boolean(fields?.responseDueDate)}
          />
        </Field>
      </div>

      {selectedRequirement ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="font-semibold text-blue-950">
            {selectedRequirement.purpose}
          </p>
          <p className="mt-1 text-xs text-blue-800">
            {selectedRequirement.site.name} · Needed by{" "}
            {selectedRequirement.neededBy} · {selectedRequirement.lines.length}{" "}
            material lines
          </p>
          <ul className="mt-3 grid gap-2 text-sm text-blue-950 sm:grid-cols-2">
            {selectedRequirement.lines.map((line) => (
              <li key={line.id}>
                {line.material.name}: {line.quantity} {line.unit.symbol}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-700">
          Suppliers to include in the draft
        </legend>
        <p className="text-xs text-slate-500">
          Select at least one active supplier. This records sourcing intent but
          does not issue an RFQ.
        </p>
        {fields?.supplierIds?.[0] ? (
          <p className="text-sm text-red-700" role="alert">
            {fields.supplierIds[0]}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => (
            <label
              key={supplier.id}
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 hover:border-blue-300"
            >
              <input
                type="checkbox"
                name="supplierId"
                value={supplier.id}
                className="mt-1 size-4 accent-blue-700"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {supplier.tradeName ?? supplier.legalName}
                </span>
                <span className="block text-xs text-slate-500">
                  {supplier.supplierCode} · {supplier.city}, {supplier.state}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Commercial notes"
        htmlFor="rfq-notes"
        error={fields?.notes?.[0]}
        hint="Optional draft instructions; award and PO terms remain locked."
      >
        <Textarea
          id="rfq-notes"
          name="notes"
          maxLength={2_000}
          placeholder="Requested quotation format, delivery assumptions, or clarifications"
          aria-invalid={Boolean(fields?.notes)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || !requirements.length || !suppliers.length}
        >
          <FilePlus2 className="size-4" />
          {pending ? "Saving RFQ draft..." : "Create RFQ draft"}
        </Button>
        <p className="text-xs text-slate-500">
          Saving does not send, award, approve, or create a purchase order.
        </p>
      </div>
      <FormFeedback state={state} success="RFQ draft created." />
    </form>
  );
}
